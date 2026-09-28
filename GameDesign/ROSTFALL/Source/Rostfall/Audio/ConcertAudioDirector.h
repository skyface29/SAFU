// ROSTFALL — adaptive concert audio director.
//
// Plays the licensed live multitrack of the current song through one MetaSound ("LiveMix"), keeps it
// sample-locked to a Quartz clock, and bends it to the player's situation:
//   * Stealth / Alert / Combat snapshots (stem gains, "wall" low-pass, reverb send), plus occlusion;
//   * breaking cover hits the full mix on the next beat, not at a random moment;
//   * Takt-Finishers: the finisher montage is time-warped so the impact lands on the grid, the bass
//     stinger is queued on that exact boundary by Quartz, and the LiveMix graph sidechain-ducks around it.
//
// Networking: the server owns the show clock (song + start time) and replicates it. Every client aligns its
// own Quartz clock and LiveMix to it; the music *state* is local to each player. See GDD.md §10.4 and §12.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ConcertAudioTypes.h"
#include "ConcertAudioDirector.generated.h"

class UAudioComponent;
class UQuartzClockHandle;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnConcertBeat, int32, Bar, int32, Beat);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnConcertMusicStateChanged, EConcertMusicState, NewState);

/** Server-authoritative show clock. Replicated only when the song changes. */
USTRUCT(BlueprintType)
struct FConcertShowClock
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Concert")
	int32 SongIndex = INDEX_NONE;

	/** Server time at which sample 0 (bar 1, beat 1) of the song plays. */
	UPROPERTY(BlueprintReadOnly, Category = "Concert")
	double ServerStartTime = 0.0;
};

UCLASS(Blueprintable, Config = Game)
class ROSTFALL_API AConcertAudioDirector : public AActor
{
	GENERATED_BODY()

public:
	AConcertAudioDirector();

	/** The director of the world the context object lives in (one per concert level). */
	UFUNCTION(BlueprintPure, Category = "Concert", meta = (WorldContext = "WorldContextObject"))
	static AConcertAudioDirector* Get(const UObject* WorldContextObject);

	// --- Show (server) -----------------------------------------------------------------------

	/** Starts a song of the setlist for everyone. LeadIn gives the replication time to reach clients. */
	UFUNCTION(BlueprintCallable, BlueprintAuthorityOnly, Category = "Concert|Show")
	void ServerStartSong(int32 SongIndex, float LeadInSeconds = 0.5f);

	/** Seconds into the current song on the shared show clock. Valid on server and clients. */
	UFUNCTION(BlueprintPure, Category = "Concert|Show")
	double GetSongPositionSeconds() const;

	// --- Gameplay -> music (local player) ----------------------------------------------------

	UFUNCTION(BlueprintCallable, Category = "Concert|Mix")
	void SetMusicState(EConcertMusicState NewState);

	UFUNCTION(BlueprintPure, Category = "Concert|Mix")
	EConcertMusicState GetMusicState() const { return CurrentState; }

	/** 0 = open air, 1 = fully behind concrete. Usually fed from the listener's Audio Gameplay Volume. */
	UFUNCTION(BlueprintCallable, Category = "Concert|Mix")
	void SetOcclusion(float InOcclusion01);

	/**
	 * Call when a finisher starts. Returns the montage play rate that puts its impact on the grid and, if one
	 * was found, queues the bass stinger + sidechain duck on that boundary.
	 * @param ImpactTimeAtNormalRate seconds from montage start to the impact frame at rate 1.0
	 */
	UFUNCTION(BlueprintCallable, Category = "Concert|Finisher")
	FConcertFinisherSync RequestFinisherSync(float ImpactTimeAtNormalRate);

	/** Called by the "Impact" anim notify. Plays the stinger only if it was not already queued on the grid. */
	UFUNCTION(BlueprintCallable, Category = "Concert|Finisher")
	void NotifyFinisherImpact();

	/** 0..1 progress through the current beat (for haptics / UI). 0 when the clock is not running. */
	UFUNCTION(BlueprintCallable, Category = "Concert|Clock")
	float GetBeatPhase();

	/** Fired on every beat of the local Quartz clock (1-based bar/beat of the transport). */
	UPROPERTY(BlueprintAssignable, Category = "Concert|Clock")
	FOnConcertBeat OnBeat;

	UPROPERTY(BlueprintAssignable, Category = "Concert|Mix")
	FOnConcertMusicStateChanged OnMusicStateChanged;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	/** Server time used by the show clock. Override to plug in the project's NTP-style clock sync. */
	virtual double GetServerTime() const;

	UPROPERTY(EditAnywhere, Category = "Concert|Show")
	TArray<FConcertSongCue> Setlist;

	UPROPERTY(EditAnywhere, Category = "Concert|Mix")
	TMap<EConcertMusicState, FConcertMixSnapshot> Snapshots;

	/** Cutoff reached at full occlusion (applied on top of the state snapshot). */
	UPROPERTY(EditAnywhere, Category = "Concert|Mix", meta = (ClampMin = "40", ClampMax = "2000"))
	float FullyOccludedCutoffHz = 250.f;

	/** How fast occlusion changes follow the listener (1/s). */
	UPROPERTY(EditAnywhere, Category = "Concert|Mix", meta = (ClampMin = "0.1"))
	float OcclusionInterpSpeed = 4.f;

	/** Stealth -> Combat waits for the next beat so the wall of sound hits with the music. */
	UPROPERTY(EditAnywhere, Category = "Concert|Mix")
	bool bQuantizeCombatEntry = true;

	/** Fade-in when joining a song that is already playing. */
	UPROPERTY(EditAnywhere, Category = "Concert|Show", meta = (ClampMin = "0"))
	float JoinInProgressFadeSeconds = 0.75f;

	UPROPERTY(EditAnywhere, Category = "Concert|Finisher", meta = (ClampMin = "0.5", ClampMax = "1.0"))
	float MinWarpRate = 0.85f;

	UPROPERTY(EditAnywhere, Category = "Concert|Finisher", meta = (ClampMin = "1.0", ClampMax = "2.0"))
	float MaxWarpRate = 1.25f;

	/** Boundaries closer than this are skipped: the command could reach the audio thread too late. */
	UPROPERTY(EditAnywhere, Category = "Concert|Finisher", meta = (ClampMin = "0.01", ClampMax = "0.2"))
	float MinSchedulingLeadSeconds = 0.05f;

	UPROPERTY(EditAnywhere, Category = "Concert|Finisher", meta = (ClampMin = "1", ClampMax = "8"))
	int32 MaxBoundaryLookahead = 4;

	UPROPERTY(EditAnywhere, Category = "Concert|Finisher", meta = (ClampMin = "-24", ClampMax = "0"))
	float FinisherDuckDepthDb = -9.f;

	/** Audio-minus-video output latency from the calibration screen (positive: sound arrives later). */
	UPROPERTY(Config, EditAnywhere, Category = "Concert|Finisher")
	float AVCalibrationOffsetMs = 0.f;

private:
	UFUNCTION()
	void OnRep_ShowClock();

	UFUNCTION()
	void HandleQuartzBeat(FName InClockName, EQuartzCommandQuantization QuantizationType, int32 NumBars, int32 Beat, float BeatFraction);

	const FConcertSongCue* GetCurrentSong() const;
	bool IsAudioClient() const;

	/** (Re)configures the Quartz clock for the song: stops it, sets tempo and meter, re-subscribes to beats. */
	void PrepareClock(const FConcertSongCue& Song);
	/** Aligns local LiveMix + Quartz to the replicated show clock (song start or join in progress). */
	void StartLocalPlayback();
	/** Starts the queued Quartz clock once the shared show clock reaches the aligned start position. */
	void TryStartPendingClock();
	void StopLocalPlayback();

	/** Seconds until the next boundary of Grid on the running clock, and that grid's length. */
	bool GetTimeToNextBoundary(EQuartzCommandQuantization Grid, float& OutToNext, float& OutGridSeconds);

	/** A 2D one-shot per finisher: stingers may overlap, and a queued one is never restarted early. */
	UAudioComponent* SpawnStinger(const FConcertSongCue& Song) const;
	void ArmFinisherDuck(float DelaySeconds);
	FConcertMixSnapshot ComputeEffectiveMix() const;
	void PushMix(const FConcertMixSnapshot& Mix, bool bForce);

	UPROPERTY(ReplicatedUsing = OnRep_ShowClock)
	FConcertShowClock ShowClock;

	UPROPERTY(VisibleAnywhere, Category = "Concert")
	TObjectPtr<UAudioComponent> LiveMixComponent;

	UPROPERTY(Transient)
	TObjectPtr<UQuartzClockHandle> ClockHandle;

	/** Unquantized fallback: created at RequestFinisherSync, played by NotifyFinisherImpact. */
	UPROPERTY(Transient)
	TObjectPtr<UAudioComponent> PendingImpactStinger;

	FName ClockName;

	/** Song position (bar-aligned) at which the local clock + LiveMix start. */
	double PendingClockStartSongPosition = 0.0;
	bool bClockStartPending = false;

	EConcertMusicState CurrentState = EConcertMusicState::Ambient;
	FConcertMixSnapshot BlendFrom;
	FConcertMixSnapshot BlendTo;
	FConcertMixSnapshot CurrentMix;
	FConcertMixSnapshot LastPushedMix;
	float BlendAlpha = 1.f;
	float PendingBlendDelay = 0.f;

	float TargetOcclusion = 0.f;
	float SmoothedOcclusion = 0.f;

	bool bHasPushedMix = false;
};
