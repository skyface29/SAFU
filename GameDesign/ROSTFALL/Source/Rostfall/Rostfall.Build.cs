// ROSTFALL — game module rules (fragment: only what the concert audio sample needs).
// The .uproject must enable the "Metasound" plugin (on by default in UE 5.x).

using UnrealBuildTool;

public class Rostfall : ModuleRules
{
	public Rostfall(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"AudioMixer",       // Quartz: UQuartzSubsystem, UQuartzClockHandle
			"AudioExtensions",  // audio parameter interface (Set*Parameter on UAudioComponent)
			"MetasoundEngine",  // UMetaSoundSource
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"NetCore",
		});
	}
}
