// ROSTFALL — shared types for the adaptive concert audio.
// See GDD.md §12 for the design these types implement.

#pragma once

#include "CoreMinimal.h"
#include "Sound/QuartzQuantizationUtilities.h"
#include "ConcertAudioTypes.generated.h"

class UMetaSoundSource;
class USoundBase;

/**
 * What the local player's situation asks from the music.
 * Order matters: states are compared (Stealth -> Combat is a "break cover" transition).
 */
UENUM(BlueprintType)
enum class EConcertMusicState : uint8
{
	Ambient,	// outside the stadium: sub-bass and crowd through concrete
	Stealth,	// ducts, cable trays, cover: muffled, dry rhythm section
	Alert,		// guards are suspicious: guitars creep in, filter opens
	Combat		// glass is broken: the full live mix, as heard in the pit
};

/** One mix of the LiveMix MetaSound. Gains are linear, cutoff is in Hz. */
USTRUCT(BlueprintType)
struct FConcertMixSnapshot
{
	GENERATED_BODY()

	/** "Wall" low-pass on the stem bus. 20 kHz = open air. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mix", meta = (ClampMin = "40", ClampMax = "20000"))
	float LowPassCutoffHz = 20000.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mix|Stems", meta = (ClampMin = "0", ClampMax = "2"))
	float DrumsGain = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mix|Stems", meta = (ClampMin = "0", ClampMax = "2"))
	float BassGain = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mix|Stems", meta = (ClampMin = "0", ClampMax = "2"))
	float GuitarsGain = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mix|Stems", meta = (ClampMin = "0", ClampMax = "2"))
	float VocalsGain = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mix|Stems", meta = (ClampMin = "0", ClampMax = "2"))
	float KeysGain = 1.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mix|Stems", meta = (ClampMin = "0", ClampMax = "2"))
	float CrowdGain = 1.f;

	/** Send into the stadium convolution reverb: more send = further away / behind walls. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mix", meta = (ClampMin = "0", ClampMax = "1"))
	float ReverbSend = 0.3f;

	/** Finisher stinger level in this state (it is also filtered by LowPassCutoffHz). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mix", meta = (ClampMin = "0", ClampMax = "2"))
	float StingerGain = 1.f;

	/** Seconds to blend INTO this snapshot. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mix", meta = (ClampMin = "0", Units = "s"))
	float BlendTime = 1.f;

	/** Blend A -> B. The cutoff is swept in log space: the ear hears octaves, not hertz. */
	static FConcertMixSnapshot Blend(const FConcertMixSnapshot& A, const FConcertMixSnapshot& B, float Alpha)
	{
		FConcertMixSnapshot Out = B;
		Out.LowPassCutoffHz = FMath::Exp(FMath::Lerp(FMath::Loge(FMath::Max(A.LowPassCutoffHz, 1.f)),
		                                             FMath::Loge(FMath::Max(B.LowPassCutoffHz, 1.f)), Alpha));
		Out.DrumsGain   = FMath::Lerp(A.DrumsGain,   B.DrumsGain,   Alpha);
		Out.BassGain    = FMath::Lerp(A.BassGain,    B.BassGain,    Alpha);
		Out.GuitarsGain = FMath::Lerp(A.GuitarsGain, B.GuitarsGain, Alpha);
		Out.VocalsGain  = FMath::Lerp(A.VocalsGain,  B.VocalsGain,  Alpha);
		Out.KeysGain    = FMath::Lerp(A.KeysGain,    B.KeysGain,    Alpha);
		Out.CrowdGain   = FMath::Lerp(A.CrowdGain,   B.CrowdGain,   Alpha);
		Out.ReverbSend  = FMath::Lerp(A.ReverbSend,  B.ReverbSend,  Alpha);
		Out.StingerGain = FMath::Lerp(A.StingerGain, B.StingerGain, Alpha);
		return Out;
	}
};

/**
 * One song of the setlist.
 * Content rule: stems are exported bar-aligned — sample 0 is bar 1, beat 1 (pickups are padded to a whole bar).
 * Songs with tempo changes use a Harmonix MIDI tempo map instead of a single BPM (out of scope of this sample).
 */
USTRUCT(BlueprintType)
struct FConcertSongCue
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Song")
	FName SongId;

	/** Multitrack live recording as a MetaSound exposing the inputs listed in ConcertParams (GDD §12.3). */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Song")
	TObjectPtr<UMetaSoundSource> LiveMix;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Song", meta = (ClampMin = "40", ClampMax = "240"))
	float BeatsPerMinute = 120.f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Song", meta = (ClampMin = "1", ClampMax = "16"))
	int32 BeatsPerBar = 4;

	/** Sub-drop + distorted kick, played exactly on the grid when a Takt-Finisher lands. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Song")
	TObjectPtr<USoundBase> FinisherStinger;

	double GetBarSeconds() const
	{
		return 60.0 / FMath::Max(BeatsPerMinute, 1.f) * FMath::Max(BeatsPerBar, 1);
	}
};

/** What the finisher ability should do so its impact frame lands on the music grid. */
USTRUCT(BlueprintType)
struct FConcertFinisherSync
{
	GENERATED_BODY()

	/** Rate for the finisher montage (1.0 when not quantized). */
	UPROPERTY(BlueprintReadOnly, Category = "Finisher")
	float MontagePlayRate = 1.f;

	/** Seconds from now until the (warped) impact frame is displayed. */
	UPROPERTY(BlueprintReadOnly, Category = "Finisher")
	float SecondsToImpact = 0.f;

	/** True: the stinger is queued on the Quartz clock. False: the Impact anim notify fires it. */
	UPROPERTY(BlueprintReadOnly, Category = "Finisher")
	bool bQuantized = false;

	UPROPERTY(BlueprintReadOnly, Category = "Finisher")
	EQuartzCommandQuantization Grid = EQuartzCommandQuantization::None;
};

/** Result of the beat-warp solver. */
struct FConcertWarpSolution
{
	float PlayRate = 1.f;
	/** Seconds from now to the chosen grid boundary (audio time). */
	float SecondsToBoundary = 0.f;
	/** 0 = next boundary, 1 = the one after, ... INDEX_NONE = no reachable boundary. */
	int32 BoundaryIndex = INDEX_NONE;

	bool IsValid() const { return BoundaryIndex != INDEX_NONE; }
};

namespace ConcertBeatMath
{
	/**
	 * Picks the grid boundary a finisher impact can be warped onto with the least visible speed change.
	 * Pure math with no engine state, so the server can run it against the authoritative show clock and
	 * clients can run it against Quartz. Both get the same answer for the same inputs.
	 *
	 * @param ImpactTime      seconds from montage start to the impact frame at play rate 1.0
	 * @param ToNextBoundary  seconds from now to the next boundary of the grid
	 * @param GridSeconds     length of one grid unit (beat, eighth...)
	 * @param AVOffset        calibrated "audio heard minus picture shown" latency, seconds (may be negative)
	 * @param MinRate/MaxRate allowed montage play-rate range
	 * @param MinLead         boundaries closer than this are skipped: the audio thread could miss them
	 * @param MaxLookahead    how many upcoming boundaries to consider
	 */
	inline FConcertWarpSolution SolveWarp(float ImpactTime, float ToNextBoundary, float GridSeconds, float AVOffset,
	                                      float MinRate, float MaxRate, float MinLead, int32 MaxLookahead)
	{
		FConcertWarpSolution Best;
		if (ImpactTime <= 0.f || GridSeconds <= KINDA_SMALL_NUMBER)
		{
			return Best;
		}

		for (int32 K = 0; K < MaxLookahead; ++K)
		{
			const float Boundary = ToNextBoundary + K * GridSeconds;
			if (Boundary < MinLead)
			{
				continue;
			}

			// The picture must show the impact when the hit is *heard*, not when it is rendered.
			const float VisualImpact = Boundary + AVOffset;
			if (VisualImpact <= KINDA_SMALL_NUMBER)
			{
				continue;
			}

			const float Rate = ImpactTime / VisualImpact;
			if (Rate < MinRate || Rate > MaxRate)
			{
				continue;
			}

			if (!Best.IsValid() || FMath::Abs(Rate - 1.f) < FMath::Abs(Best.PlayRate - 1.f))
			{
				Best.PlayRate = Rate;
				Best.SecondsToBoundary = Boundary;
				Best.BoundaryIndex = K;
			}
		}
		return Best;
	}
}
