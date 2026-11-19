// 大肥鱼桌宠 · 启动器引导程序
// 编译：csc /target:winexe /out:大肥鱼桌宠.exe /win32icon:launcher\launcher.ico launcher\Launcher.cs /r:System.Windows.Forms.dll
//
// 职责很单一：零窗口地拉起 launcher\launcher.ps1。
// 为什么不由 exe 承载界面：launcher.ps1 里有整页 WinForms 布局，并靠 $PSScriptRoot
// 相对定位 services.ps1 / launcher.ico / version.json；把 ps1 嵌进 exe 会让
// $PSScriptRoot 指向临时目录，这些依赖全部失联。所以 exe 只当引导层。

using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

// ---- 版本信息（资源管理器「属性 → 详细信息」会显示）----
[assembly: System.Reflection.AssemblyTitle("大肥鱼桌宠")]
[assembly: System.Reflection.AssemblyProduct("大肥鱼桌宠")]
[assembly: System.Reflection.AssemblyCompany("DeepSeek 社区")]
[assembly: System.Reflection.AssemblyDescription("Live2D 桌宠启动器：一键启停 TTS / ASR / 桌宠")]
[assembly: System.Reflection.AssemblyCopyright("MIT License")]
[assembly: System.Reflection.AssemblyVersion("1.1.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.1.0.0")]
[assembly: System.Reflection.AssemblyInformationalVersion("1.1.0")]

internal static class Launcher
{
    [STAThread]
    private static void Main()
    {
        string exeDir;
        try
        {
            exeDir = Path.GetDirectoryName(Application.ExecutablePath);
        }
        catch
        {
            exeDir = AppDomain.CurrentDomain.BaseDirectory;
        }

        // 依次尝试：exe 同级的 launcher\、exe 同级的根目录
        string[] candidates =
        {
            Path.Combine(exeDir, "launcher", "launcher.ps1"),
            Path.Combine(exeDir, "launcher.ps1")
        };

        string script = null;
        foreach (string candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                script = candidate;
                break;
            }
        }

        if (script == null)
        {
            MessageBox.Show(
                "找不到启动器脚本，请确认目录完整：\r\n\r\n" +
                Path.Combine(exeDir, "launcher", "launcher.ps1"),
                "大肥鱼桌宠",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + script + "\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = exeDir
        };

        // 上层 shell（含 Electron 宿主）可能注入该变量，会让 Electron 以纯 Node 模式启动并崩溃
        try
        {
            psi.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
        }
        catch
        {
            // 环境变量表不可写时忽略，不影响主流程
        }

        try
        {
            Process.Start(psi);
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "启动器未能运行：\r\n\r\n" + error.Message,
                "大肥鱼桌宠",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}
