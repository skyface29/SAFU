// ROSTFALL — adaptive concert audio director. See ConcertAudioDirector.h and GDD.md §12.

#include "Audio/ConcertAudioDirector.h"

#include "Components/AudioComponent.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/GameStateBase.h"
#include "Kismet/GameplayStatics.h"
#include "MetasoundSource.h"
#include "Misc/App.h"
#include "Net/UnrealNetwork.h"
#include "Quartz/AudioMixerClockHandle.h"
#include "Quartz/QuartzSubsystem.h"

namespace ConcertParams
{
	// Inputs of the MSS_Concert_LiveMix graph — the contract with the sound designers (GDD §12.3).
	static const FName SeekSeconds(TEXT("SeekSeconds"));
	static const FName LowPassCutoffHz(TEXT("LowPassCutoffHz"));
	static const FName DrumsGain(TEXT("DrumsGain"));
	static const FName BassGain(TEXT("BassGain"));
	static const FName GuitarsGain(TEXT("GuitarsGain"));
	static const FName VocalsGain(TEXT("VocalsGain"));
	static const FName KeysGain(TEXT("KeysGain"));
	static const FName CrowdGain(TEXT("CrowdGain"));
	static const FName ReverbSend(TEXT("ReverbSend"));
	static const FName FinisherArm(TEXT("FinisherArm"));
	static const FName FinisherDelaySeconds(TEXT("FinisherDelaySeconds"));
	static const FName FinisherDuckDb(TEXT("FinisherDuckDb"));
}

namespace
{
	constexpr float GainTolerance = 0.005f;
	constexpr float CutoffLogTolerance = 0.01f; // ~1% — well under what anyone hears on a filter sweep

	FConcertMixSnapshot MakeSnapshot(float CutoffHz, float Drums, float Bass, float Guitars, float Vocals, float Keys,
	                                 float Crowd, float Reverb, float Stinger, float BlendTime)
	{
		FConcertMixSnapshot Snapshot;
		Snapshot.LowPassCutoffHz = CutoffHz;
		Snapshot.DrumsGain = Drums;
		Snapshot.BassGain = Bass;
		Snapshot.GuitarsGain = Guitars;
		Snapshot.VocalsGain = Vocals;
		Snapshot.KeysGain = Keys;
		Snapshot.CrowdGain = Crowd;
		Snapshot.ReverbSend = Reverb;
		Snapshot.StingerGain = Stinger;
		Snapshot.BlendTime = BlendTime;
		return Snapshot;
	}
}

AConcertAudioDirector::AConcertAudioDirector()
{
	PrimaryActorTick.bCanEverTick = true;
	bReplicates = true;
	bAlwaysRelevant = true;

	// The perceptual mix is 2D: direction comes from the spatial PA arrays, not from here.
	LiveMixComponent = CreateDefaultSubobject<UAudioComponent>(TEXT("LiveMix"));
	LiveMixComponent->bAutoActivate = false;
	LiveMixComponent->bAllowSpatialization = false;
	RootComponent = LiveMixComponent;

	// Defaults from GDD §12.2 — tuned per level by the audio team.
	//                                               Cutoff  Drums Bass  Guit  Voc   Keys  Crowd Rev   Sting Blend
	Snapshots.Add(EConcertMusicState::Ambient, MakeSnapshot(  350.f, 0.8f, 1.0f, 0.2f, 0.1f, 0.2f, 0.9f, 0.8f, 0.5f, 2.0f));
	Snapshots.Add(EConcertMusicState::Stealth, MakeSnapshot(  900.f, 1.0f, 0.9f, 0.35f,0.25f,0.5f, 0.7f, 0.6f, 0.7f, 1.5f));
	Snapshots.Add(EConcertMusicState::Alert,   MakeSnapshot( 3500.f, 1.0f, 1.0f, 0.8f, 0.6f, 0.7f, 0.8f, 0.4f, 0.9f, 0.6f));
	Snapshots.Add(EConcertMusicState::Combat,  MakeSnapshot(20000.f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 0.25f,1.0f, 0.08f));
}

AConcertAudioDirector* AConcertAudioDirector::Get(const UObject* WorldContextObject)
{
	UWorld* World = GEngine ? GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull) : nullptr;
	if (!World)
	{
		return nullptr;
	}

	// One director per concert level; lookups happen per finisher, not per frame.
	TActorIterator<AConcertAudioDirector> It(World);
	return It ? *It : nullptr;
}

void AConcertAudioDirector::BeginPlay()
{
	Super::BeginPlay();

	ClockName = FName(*FString::Printf(TEXT("ConcertClock_%s"), *GetName()));

	// Snapshots may have been edited on the instance after construction.
	CurrentMix = BlendFrom = BlendTo = Snapshots.FindRef(CurrentState);
	BlendAlpha = 1.f;

	if (!IsAudioClient())
	{
		// A dedicated server keeps the show clock but never makes a sound.
		SetActorTickEnabled(false);
		return;
	}

	// Join in progress: the show clock can arrive with the initial replication, before BeginPlay.
	if (ShowClock.SongIndex != INDEX_NONE)
	{
		StartLocalPlayback();
	}
}

void AConcertAudioDirector::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	StopLocalPlayback();

	if (ClockHandle)
	{
		if (UQuartzSubsystem* Quartz = GetWorld()->GetSubsystem<UQuartzSubsystem>())
		{
			Quartz->DeleteClockByName(this, ClockName);
		}
		ClockHandle = nullptr;
	}

	Super::EndPlay(EndPlayReason);
}

void AConcertAudioDirector::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AConcertAudioDirector, ShowClock);
}

// --- Show clock ----------------------------------------------------------------------------------

void AConcertAudioDirector::ServerStartSong(int32 SongIndex, float LeadInSeconds)
{
	if (!HasAuthority() || !Setlist.IsValidIndex(SongIndex))
	{
		return;
	}

	ShowClock.SongIndex = SongIndex;
	ShowClock.ServerStartTime = GetServerTime() + FMath::Max(LeadInSeconds, 0.f);
	ForceNetUpdate();

	// OnRep does not run on the authority: a listen server or the campaign starts its own playback.
	if (IsAudioClient() && HasActorBegunPlay())
	{
		StartLocalPlayback();
	}
}

void AConcertAudioDirector::OnRep_ShowClock()
{
	if (IsAudioClient() && HasActorBegunPlay())
	{
		StartLocalPlayback();
	}
}

double AConcertAudioDirector::GetServerTime() const
{
	const UWorld* World = GetWorld();
	if (!World)
	{
		return 0.0;
	}

	// Campaign: slow-mo dilates world time but not the music, so follow the audio clock (it still pauses with the game).
	if (GetNetMode() == NM_Standalone)
	{
		return World->GetAudioTimeSeconds();
	}

	// Stock replicated world time is coarse; shipping builds override this with an NTP-style sync (GDD §10.4).
	const AGameStateBase* GameState = World->GetGameState();
	return GameState ? GameState->GetServerWorldTimeSeconds() : World->GetTimeSeconds();
}

double AConcertAudioDirector::GetSongPositionSeconds() const
{
	return ShowClock.SongIndex == INDEX_NONE ? 0.0 : GetServerTime() - ShowClock.ServerStartTime;
}

const FConcertSongCue* AConcertAudioDirector::GetCurrentSong() const
{
	return Setlist.IsValidIndex(ShowClock.SongIndex) ? &Setlist[ShowClock.SongIndex] : nullptr;
}

bool AConcertAudioDirector::IsAudioClient() const
{
	return GetNetMode() != NM_DedicatedServer;
}

// --- Local playback ------------------------------------------------------------------------------

void AConcertAudioDirector::PrepareClock(const FConcertSongCue& Song)
{
	UQuartzSubsystem* Quartz = GetWorld()->GetSubsystem<UQuartzSubsystem>();
	if (!Quartz)
	{
		return;
	}

	FQuartzClockSettings Settings;
	Settings.TimeSignature.NumBeats = Song.BeatsPerBar;
	Settings.TimeSignature.BeatType = EQuartzTimeSignatureQuantization::QuarterNote;

	ClockHandle = Quartz->CreateNewClock(this, ClockName, Settings, /*bOverrideSettingsIfClockExists*/ true);
	UQuartzClockHandle* Handle = ClockHandle;
	if (!Handle)
	{
		return; // no audio mixer (e.g. -nosound)
	}

	// Stopping also resets the transport, so the next start is bar 1, beat 1 again.
	Handle->StopClock(this, /*CancelPendingEvents*/ true, Handle);
	Handle->UnsubscribeFromAllTimeDivisions(this, Handle);

	FQuartzQuantizationBoundary Immediately;
	Immediately.Quantization = EQuartzCommandQuantization::None;
	Handle->SetBeatsPerMinute(this, Immediately, FOnQuartzCommandEventBP(), Handle, Song.BeatsPerMinute);

	FOnQuartzMetronomeEventBP BeatEvent;
	BeatEvent.BindUFunction(this, GET_FUNCTION_NAME_CHECKED(AConcertAudioDirector, HandleQuartzBeat));
	Handle->SubscribeToQuantizationEvent(this, EQuartzCommandQuantization::Beat, BeatEvent, Handle);
}

void AConcertAudioDirector::StartLocalPlayback()
{
	StopLocalPlayback();

	const FConcertSongCue* Song = GetCurrentSong();
	if (!Song || !Song->LiveMix)
	{
		return;
	}

	PrepareClock(*Song);
	UQuartzClockHandle* Handle = ClockHandle;
	if (!Handle)
	{
		return;
	}

	// Joining mid-song snaps forward to the next downbeat, so Quartz bar 1 is a real bar of the song and
	// bar-quantized cues stay musical. The wait (under one bar) is hidden by the rift transition.
	const double BarSeconds = Song->GetBarSeconds();
	const double SongPosition = GetSongPositionSeconds();
	PendingClockStartSongPosition = SongPosition <= 0.0 ? 0.0 : FMath::CeilToDouble(SongPosition / BarSeconds) * BarSeconds;

	LiveMixComponent->SetSound(Song->LiveMix);
	// MetaSounds do not seek by themselves: the graph wires SeekSeconds into every Wave Player's Start Time.
	LiveMixComponent->SetFloatParameter(ConcertParams::SeekSeconds, static_cast<float>(PendingClockStartSongPosition));
	PushMix(ComputeEffectiveMix(), /*bForce*/ true);

	// The song is queued to start exactly when the clock starts: audio and grid are sample-locked on this machine.
	FQuartzQuantizationBoundary OnClockStart;
	OnClockStart.Quantization = EQuartzCommandQuantization::Bar;
	OnClockStart.Multiplier = 1.f;
	OnClockStart.CountingReferencePoint = EQuarztQuantizationReference::TransportRelative;
	OnClockStart.bFireOnClockStart = true;
	OnClockStart.bCancelCommandIfClockIsNotRunning = false;

	const float FadeInSeconds = PendingClockStartSongPosition > 0.0 ? JoinInProgressFadeSeconds : 0.f;
	LiveMixComponent->PlayQuantized(this, Handle, OnClockStart, FOnQuartzCommandEventBP(), /*InStartTime*/ 0.f, FadeInSeconds);

	// The clock itself starts in Tick once the shared show clock reaches the start position. Using the same time
	// base as the server (instead of a world timer) keeps every client within a frame of each other.
	bClockStartPending = true;
	TryStartPendingClock();
}

void AConcertAudioDirector::TryStartPendingClock()
{
	if (!bClockStartPending || GetSongPositionSeconds() < PendingClockStartSongPosition)
	{
		return;
	}

	bClockStartPending = false;
	if (UQuartzClockHandle* Handle = ClockHandle)
	{
		Handle->StartClock(this, Handle);
	}
}

void AConcertAudioDirector::StopLocalPlayback()
{
	bClockStartPending = false;

	if (PendingImpactStinger)
	{
		PendingImpactStinger->DestroyComponent(); // never played, so auto-destroy would not reclaim it
		PendingImpactStinger = nullptr;
	}

	if (UQuartzClockHandle* Handle = ClockHandle)
	{
		Handle->StopClock(this, /*CancelPendingEvents*/ true, Handle);
	}
	LiveMixComponent->Stop();
}

void AConcertAudioDirector::HandleQuartzBeat(FName InClockName, EQuartzCommandQuantization QuantizationType, int32 NumBars, int32 Beat, float BeatFraction)
{
	OnBeat.Broadcast(NumBars, Beat);
}

bool AConcertAudioDirector::GetTimeToNextBoundary(EQuartzCommandQuantization Grid, float& OutToNext, float& OutGridSeconds)
{
	UQuartzClockHandle* Handle = ClockHandle;
	if (!Handle || !Handle->IsClockRunning(this))
	{
		return false;
	}

	OutGridSeconds = Handle->GetDurationOfQuantizationTypeInSeconds(this, Grid, 1.f);
	if (OutGridSeconds <= KINDA_SMALL_NUMBER)
	{
		return false;
	}

	// Progress comes from the clock's last audio-render update, so it can trail by up to one audio block;
	// MinSchedulingLeadSeconds covers that when we schedule against it.
	const float Progress = FMath::Clamp(Handle->GetBeatProgressPercent(Grid), 0.f, 1.f);
	OutToNext = (1.f - Progress) * OutGridSeconds;
	return true;
}

float AConcertAudioDirector::GetBeatPhase()
{
	float ToNext = 0.f;
	float GridSeconds = 0.f;
	return GetTimeToNextBoundary(EQuartzCommandQuantization::Beat, ToNext, GridSeconds) ? 1.f - ToNext / GridSeconds : 0.f;
}

// --- Mix -----------------------------------------------------------------------------------------

void AConcertAudioDirector::SetMusicState(EConcertMusicState NewState)
{
	if (NewState == CurrentState)
	{
		return;
	}

	const bool bBreakingCover = NewState == EConcertMusicState::Combat && CurrentState <= EConcertMusicState::Stealth;

	// Blend from wherever we are right now, so interrupted transitions never jump.
	BlendFrom = CurrentMix;
	BlendTo = Snapshots.FindRef(NewState);
	BlendAlpha = 0.f;
	PendingBlendDelay = 0.f;

	// Breaking cover holds the old mix until the next beat and then slams the new one in on it. Starting the blend
	// from the game thread lands within a frame of the beat: a filter opening that late is inaudible, a drum is not
	// (which is why stingers go through Quartz instead).
	float ToNext = 0.f;
	float GridSeconds = 0.f;
	if (bBreakingCover && bQuantizeCombatEntry && GetTimeToNextBoundary(EQuartzCommandQuantization::Beat, ToNext, GridSeconds))
	{
		PendingBlendDelay = ToNext;
	}

	CurrentState = NewState;
	OnMusicStateChanged.Broadcast(NewState);
}

void AConcertAudioDirector::SetOcclusion(float InOcclusion01)
{
	TargetOcclusion = FMath::Clamp(InOcclusion01, 0.f, 1.f);
}

void AConcertAudioDirector::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	TryStartPendingClock();

	// The music runs in real time, so mix transitions ignore time dilation (finisher slow-mo).
	const float RealDelta = static_cast<float>(FApp::GetDeltaTime());
	bool bBlendFinished = false;

	if (PendingBlendDelay > 0.f)
	{
		PendingBlendDelay -= RealDelta;
	}
	else if (BlendAlpha < 1.f)
	{
		const float Duration = BlendTo.BlendTime;
		BlendAlpha = Duration <= KINDA_SMALL_NUMBER ? 1.f : FMath::Min(1.f, BlendAlpha + RealDelta / Duration);
		// Smoothstep: no audible "corner" at either end of a transition.
		CurrentMix = FConcertMixSnapshot::Blend(BlendFrom, BlendTo, FMath::SmoothStep(0.f, 1.f, BlendAlpha));
		bBlendFinished = BlendAlpha >= 1.f;
	}

	SmoothedOcclusion = FMath::FInterpTo(SmoothedOcclusion, TargetOcclusion, RealDelta, OcclusionInterpSpeed);

	// Force the final values of a finished blend through the change filter so the target is hit exactly.
	PushMix(ComputeEffectiveMix(), bBlendFinished);
}

FConcertMixSnapshot AConcertAudioDirector::ComputeEffectiveMix() const
{
	FConcertMixSnapshot Mix = CurrentMix;
	if (SmoothedOcclusion > KINDA_SMALL_NUMBER)
	{
		// Occlusion closes the wall further (in log space) and pushes the mix "into the room".
		const float OccludedCutoff = FMath::Exp(FMath::Lerp(FMath::Loge(FMath::Max(Mix.LowPassCutoffHz, 1.f)),
		                                                    FMath::Loge(FMath::Max(FullyOccludedCutoffHz, 1.f)),
		                                                    SmoothedOcclusion));
		Mix.LowPassCutoffHz = FMath::Min(Mix.LowPassCutoffHz, OccludedCutoff);
		Mix.ReverbSend = FMath::Lerp(Mix.ReverbSend, 1.f, 0.5f * SmoothedOcclusion);
	}
	return Mix;
}

void AConcertAudioDirector::PushMix(const FConcertMixSnapshot& Mix, bool bForce)
{
	// Every Set*Parameter is a message to the audio render thread: only send what actually changed. Each field is
	// compared with the value last *sent*, so slow drifts still go out once they add up.
	const bool bSendAll = bForce || !bHasPushedMix;

	const auto PushGain = [this, bSendAll](const FName& Name, float Value, float& LastSent)
	{
		if (bSendAll || !FMath::IsNearlyEqual(Value, LastSent, GainTolerance))
		{
			LiveMixComponent->SetFloatParameter(Name, Value);
			LastSent = Value;
		}
	};

	PushGain(ConcertParams::DrumsGain, Mix.DrumsGain, LastPushedMix.DrumsGain);
	PushGain(ConcertParams::BassGain, Mix.BassGain, LastPushedMix.BassGain);
	PushGain(ConcertParams::GuitarsGain, Mix.GuitarsGain, LastPushedMix.GuitarsGain);
	PushGain(ConcertParams::VocalsGain, Mix.VocalsGain, LastPushedMix.VocalsGain);
	PushGain(ConcertParams::KeysGain, Mix.KeysGain, LastPushedMix.KeysGain);
	PushGain(ConcertParams::CrowdGain, Mix.CrowdGain, LastPushedMix.CrowdGain);
	PushGain(ConcertParams::ReverbSend, Mix.ReverbSend, LastPushedMix.ReverbSend);

	const float CutoffChange = FMath::Abs(FMath::Loge(FMath::Max(Mix.LowPassCutoffHz, 1.f) / FMath::Max(LastPushedMix.LowPassCutoffHz, 1.f)));
	if (bSendAll || CutoffChange > CutoffLogTolerance)
	{
		LiveMixComponent->SetFloatParameter(ConcertParams::LowPassCutoffHz, Mix.LowPassCutoffHz);
		LastPushedMix.LowPassCutoffHz = Mix.LowPassCutoffHz;
	}

	bHasPushedMix = true;
}

// --- Takt-Finisher -------------------------------------------------------------------------------

FConcertFinisherSync AConcertAudioDirector::RequestFinisherSync(float ImpactTimeAtNormalRate)
{
	FConcertFinisherSync Result;
	Result.SecondsToImpact = ImpactTimeAtNormalRate;

	const FConcertSongCue* Song = GetCurrentSong();
	if (!IsAudioClient() || !Song || !Song->FinisherStinger)
	{
		return Result;
	}

	// A new finisher supersedes an older one that is still waiting for its Impact notify.
	if (PendingImpactStinger)
	{
		PendingImpactStinger->DestroyComponent();
		PendingImpactStinger = nullptr;
	}

	const float AVOffsetSeconds = AVCalibrationOffsetMs * 0.001f;

	// The beat first; eighths only when no beat is reachable without visibly warping the animation.
	for (const EQuartzCommandQuantization Grid : { EQuartzCommandQuantization::Beat, EQuartzCommandQuantization::EighthNote })
	{
		float ToNext = 0.f;
		float GridSeconds = 0.f;
		if (!GetTimeToNextBoundary(Grid, ToNext, GridSeconds))
		{
			break; // clock not running: nothing to lock to
		}

		const FConcertWarpSolution Warp = ConcertBeatMath::SolveWarp(ImpactTimeAtNormalRate, ToNext, GridSeconds, AVOffsetSeconds,
		                                                             MinWarpRate, MaxWarpRate, MinSchedulingLeadSeconds, MaxBoundaryLookahead);
		if (!Warp.IsValid())
		{
			continue;
		}

		// Current-time-relative counting: Multiplier N fires on the N-th upcoming boundary of the grid,
		// rendered sample-accurately by the audio mixer.
		FQuartzQuantizationBoundary Boundary;
		Boundary.Quantization = Grid;
		Boundary.Multiplier = static_cast<float>(Warp.BoundaryIndex + 1);
		Boundary.CountingReferencePoint = EQuarztQuantizationReference::CurrentTimeRelative;
		Boundary.bCancelCommandIfClockIsNotRunning = true;

		UAudioComponent* Stinger = SpawnStinger(*Song);
		if (!Stinger)
		{
			break;
		}

		UQuartzClockHandle* Handle = ClockHandle;
		Stinger->PlayQuantized(this, Handle, Boundary, FOnQuartzCommandEventBP());
		ArmFinisherDuck(Warp.SecondsToBoundary);

		Result.MontagePlayRate = Warp.PlayRate;
		Result.SecondsToImpact = Warp.SecondsToBoundary + AVOffsetSeconds;
		Result.bQuantized = true;
		Result.Grid = Grid;
		return Result;
	}

	// No reachable boundary (or no running clock): the Impact anim notify plays the stinger unquantized.
	PendingImpactStinger = SpawnStinger(*Song);
	return Result;
}

void AConcertAudioDirector::NotifyFinisherImpact()
{
	if (!PendingImpactStinger)
	{
		return; // already queued on the grid, or no finisher was requested
	}

	PendingImpactStinger->Play();
	PendingImpactStinger = nullptr; // auto-destroys when it finishes
	ArmFinisherDuck(0.f);
}

UAudioComponent* AConcertAudioDirector::SpawnStinger(const FConcertSongCue& Song) const
{
	UAudioComponent* Stinger = UGameplayStatics::CreateSound2D(this, Song.FinisherStinger, /*Volume*/ 1.f, /*Pitch*/ 1.f,
	                                                           /*StartTime*/ 0.f, /*Concurrency*/ nullptr,
	                                                           /*bPersistAcrossLevelTransition*/ false, /*bAutoDestroy*/ true);
	if (Stinger)
	{
		// The stinger follows the "wall": in stealth the hit is felt more than heard.
		const FConcertMixSnapshot Mix = ComputeEffectiveMix();
		Stinger->SetLowPassFilterEnabled(true);
		Stinger->SetLowPassFilterFrequency(Mix.LowPassCutoffHz);
		Stinger->SetVolumeMultiplier(Mix.StingerGain);
	}
	return Stinger;
}

void AConcertAudioDirector::ArmFinisherDuck(float DelaySeconds)
{
	// The duck envelope lives inside the LiveMix graph (Trigger Delay -> AD envelope -> stem bus), so it is
	// sample-accurate against the music; only this "arm" message crosses threads, at most one audio block late.
	LiveMixComponent->SetFloatParameter(ConcertParams::FinisherDelaySeconds, FMath::Max(DelaySeconds, 0.f));
	LiveMixComponent->SetFloatParameter(ConcertParams::FinisherDuckDb, FinisherDuckDepthDb);
	LiveMixComponent->SetTriggerParameter(ConcertParams::FinisherArm);
}
