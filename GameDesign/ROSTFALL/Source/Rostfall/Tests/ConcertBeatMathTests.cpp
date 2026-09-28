// ROSTFALL — automation tests for the beat-warp solver.
// Session Frontend -> Automation -> "Rostfall.Audio.BeatWarp".

#include "Misc/AutomationTest.h"
#include "Audio/ConcertAudioTypes.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FConcertBeatWarpTest, "Rostfall.Audio.BeatWarp",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter)

bool FConcertBeatWarpTest::RunTest(const FString& Parameters)
{
	constexpr float Beat = 0.5f;    // 120 BPM
	constexpr float Eighth = 0.25f;
	constexpr float MinRate = 0.85f;
	constexpr float MaxRate = 1.25f;
	constexpr float MinLead = 0.05f;

	// Impact 0.45 s away, next beat in 0.40 s: speed the finisher up slightly onto that beat.
	{
		const FConcertWarpSolution S = ConcertBeatMath::SolveWarp(0.45f, 0.40f, Beat, 0.f, MinRate, MaxRate, MinLead, 4);
		TestTrue(TEXT("A reachable beat is found"), S.IsValid());
		TestEqual(TEXT("Lands on the next beat"), S.BoundaryIndex, 0);
		TestEqual(TEXT("Rate is 0.45 / 0.40"), S.PlayRate, 1.125f, 1.e-4f);
	}

	// Next beat in 0.10 s would need x6 speed; the one after (0.60 s) matches the 0.60 s impact exactly.
	{
		const FConcertWarpSolution S = ConcertBeatMath::SolveWarp(0.60f, 0.10f, Beat, 0.f, MinRate, MaxRate, MinLead, 4);
		TestEqual(TEXT("Skips the unreachable beat"), S.BoundaryIndex, 1);
		TestEqual(TEXT("No warp needed"), S.PlayRate, 1.f, 1.e-4f);
	}

	// Two reachable eighths (0.80 s -> x1.25, 1.05 s -> x0.952): the smaller speed change wins.
	{
		const FConcertWarpSolution S = ConcertBeatMath::SolveWarp(1.f, 0.05f, Eighth, 0.f, MinRate, MaxRate, MinLead, 5);
		TestEqual(TEXT("Prefers the least visible warp"), S.BoundaryIndex, 4);
		TestEqual(TEXT("Rate is 1.0 / 1.05"), S.PlayRate, 1.f / 1.05f, 1.e-4f);
	}

	// A boundary 30 ms away fits the rate range but is too close for the audio thread: never chosen.
	{
		const FConcertWarpSolution S = ConcertBeatMath::SolveWarp(0.035f, 0.03f, Beat, 0.f, MinRate, MaxRate, MinLead, 4);
		TestFalse(TEXT("Boundary under MinLead is rejected"), S.IsValid());
	}

	// Sound reaches the player 40 ms after the picture: the impact is shown 40 ms after the beat is rendered.
	{
		const FConcertWarpSolution S = ConcertBeatMath::SolveWarp(0.54f, 0.50f, Beat, 0.04f, MinRate, MaxRate, MinLead, 4);
		TestEqual(TEXT("AV offset shifts the visual target"), S.PlayRate, 1.f, 1.e-4f);
		TestEqual(TEXT("Audio boundary itself is unchanged"), S.SecondsToBoundary, 0.5f, 1.e-4f);
	}

	// Degenerate input never produces a rate.
	{
		TestFalse(TEXT("Zero impact time"), ConcertBeatMath::SolveWarp(0.f, 0.2f, Beat, 0.f, MinRate, MaxRate, MinLead, 4).IsValid());
		TestFalse(TEXT("Zero grid"), ConcertBeatMath::SolveWarp(0.5f, 0.2f, 0.f, 0.f, MinRate, MaxRate, MinLead, 4).IsValid());
	}

	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
