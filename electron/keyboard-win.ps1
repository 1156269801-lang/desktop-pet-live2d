param([int]$OwnerPid)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
public static class PetKeyboardCounter {
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int virtualKey);
    public static void Run(int owner) {
        bool[] pressed = new bool[256];
        var clock = Stopwatch.StartNew();
        int taps = 0, heldSamples = 0, samples = 0;
        bool initialized = false;
        using (var parent = Process.GetProcessById(owner)) {
            while (!parent.HasExited) {
                bool held = false;
                for (int key = 8; key < 255; key++) {
                    if (key == 0x10 || key == 0x11 || key == 0x12 || (key >= 0xA0 && key <= 0xA5)) continue;
                    bool down = (GetAsyncKeyState(key) & 0x8000) != 0;
                    if (down && !pressed[key] && initialized) taps++;
                    if (down && pressed[key]) held = true;
                    pressed[key] = down;
                }
                initialized = true;
                samples++;
                if (held) heldSamples++;
                if (clock.ElapsedMilliseconds >= 200) {
                    Console.WriteLine("{0} {1}", Math.Min(24, taps), heldSamples * 2 >= samples ? 1 : 0);
                    clock.Restart();
                    taps = heldSamples = samples = 0;
                }
                Thread.Sleep(20);
            }
        }
    }
}
"@
[PetKeyboardCounter]::Run($OwnerPid)
