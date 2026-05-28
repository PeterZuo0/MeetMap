using NAudio.Wave;
using NAudio.Wave.SampleProviders;
using System.Globalization;

namespace MeetMap.WindowsAudio;

internal sealed record CaptureOptions(
  string? SystemOutputPath,
  string? MicrophoneOutputPath,
  TimeSpan Duration,
  int? MicrophoneDeviceNumber,
  bool WaitForStdinStop
);

internal static class Program
{
  private const int Success = 0;
  private const int UsageError = 2;
  private const int CaptureError = 3;

  public static async Task<int> Main(string[] args)
  {
    try
    {
      if (args.Contains("--help", StringComparer.OrdinalIgnoreCase))
      {
        Console.WriteLine(Usage());
        return Success;
      }

      var options = ParseOptions(args);
      await CaptureAsync(options);
      Console.WriteLine("Capture complete.");
      if (options.SystemOutputPath is not null)
      {
        Console.WriteLine($"System audio: {options.SystemOutputPath}");
      }
      if (options.MicrophoneOutputPath is not null)
      {
        Console.WriteLine($"Microphone: {options.MicrophoneOutputPath}");
      }
      return Success;
    }
    catch (ArgumentException error)
    {
      Console.Error.WriteLine(error.Message);
      Console.Error.WriteLine(Usage());
      return UsageError;
    }
    catch (Exception error)
    {
      Console.Error.WriteLine($"Audio capture failed: {error.Message}");
      return CaptureError;
    }
  }

  private static CaptureOptions ParseOptions(string[] args)
  {
    var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    var flags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    for (var index = 0; index < args.Length; index++)
    {
      var key = args[index];
      if (!key.StartsWith("--", StringComparison.Ordinal))
      {
        throw new ArgumentException($"Unexpected positional argument: {key}");
      }

      if (string.Equals(key, "--wait-for-stdin-stop", StringComparison.OrdinalIgnoreCase))
      {
        flags.Add(key);
        continue;
      }

      if (index + 1 >= args.Length || args[index + 1].StartsWith("--", StringComparison.Ordinal))
      {
        throw new ArgumentException($"Missing value for {key}");
      }

      values[key] = args[++index];
    }

    var systemOutput = Optional(values, "--system-output");
    var microphoneOutput = Optional(values, "--microphone-output");
    if (systemOutput is null && microphoneOutput is null)
    {
      throw new ArgumentException("At least one of --system-output or --microphone-output is required.");
    }

    var durationSeconds = values.TryGetValue("--duration-seconds", out var durationValue)
      ? ParsePositiveDouble(durationValue, "--duration-seconds")
      : 10;
    int? microphoneDeviceNumber = values.TryGetValue("--microphone-device", out var deviceValue)
      ? ParseNonNegativeInt(deviceValue, "--microphone-device")
      : null;

    return new CaptureOptions(
      systemOutput is null ? null : Path.GetFullPath(systemOutput),
      microphoneOutput is null ? null : Path.GetFullPath(microphoneOutput),
      TimeSpan.FromSeconds(durationSeconds),
      microphoneDeviceNumber,
      flags.Contains("--wait-for-stdin-stop")
    );
  }

  private static async Task CaptureAsync(CaptureOptions options)
  {
    WasapiLoopbackCapture? systemCapture = null;
    WaveInEvent? microphoneCapture = null;
    WaveFileWriter? systemWriter = null;
    WaveFileWriter? microphoneWriter = null;
    var stoppedTasks = new List<Task>();
    var pauseState = new CapturePauseState();
    var levelReporter = new LevelReporter();

    try
    {
      if (options.SystemOutputPath is not null)
      {
        Directory.CreateDirectory(Path.GetDirectoryName(options.SystemOutputPath) ?? ".");
        systemCapture = new WasapiLoopbackCapture();
        systemWriter = new WaveFileWriter(options.SystemOutputPath, systemCapture.WaveFormat);
        stoppedTasks.Add(CreateStoppedTask(systemCapture));
        systemCapture.DataAvailable += (_, eventArgs) =>
        {
          if (!pauseState.IsPaused)
          {
            systemWriter.Write(eventArgs.Buffer, 0, eventArgs.BytesRecorded);
            levelReporter.Report("system", eventArgs.Buffer, eventArgs.BytesRecorded, systemCapture.WaveFormat);
          }
        };
        systemCapture.StartRecording();
      }

      if (options.MicrophoneOutputPath is not null)
      {
        Directory.CreateDirectory(Path.GetDirectoryName(options.MicrophoneOutputPath) ?? ".");
        microphoneCapture = CreateMicrophoneCapture(options.MicrophoneDeviceNumber);
        microphoneWriter = new WaveFileWriter(options.MicrophoneOutputPath, microphoneCapture.WaveFormat);
        stoppedTasks.Add(CreateStoppedTask(microphoneCapture));
        microphoneCapture.DataAvailable += (_, eventArgs) =>
        {
          if (!pauseState.IsPaused)
          {
            microphoneWriter.Write(eventArgs.Buffer, 0, eventArgs.BytesRecorded);
            levelReporter.Report("microphone", eventArgs.Buffer, eventArgs.BytesRecorded, microphoneCapture.WaveFormat);
          }
        };
        microphoneCapture.StartRecording();
      }

      if (options.WaitForStdinStop)
      {
        await WaitForCaptureCommandAsync(pauseState);
      }
      else
      {
        await Task.Delay(options.Duration);
      }

      systemCapture?.StopRecording();
      microphoneCapture?.StopRecording();
      await Task.WhenAll(stoppedTasks);

      systemWriter?.Flush();
      microphoneWriter?.Flush();
      if (options.SystemOutputPath is not null)
      {
        ValidateWavFile(options.SystemOutputPath, "system");
      }
      if (options.MicrophoneOutputPath is not null)
      {
        ValidateWavFile(options.MicrophoneOutputPath, "microphone");
      }
    }
    finally
    {
      systemWriter?.Dispose();
      microphoneWriter?.Dispose();
      systemCapture?.Dispose();
      microphoneCapture?.Dispose();
    }
  }

  private static async Task WaitForCaptureCommandAsync(CapturePauseState pauseState)
  {
    while (await Console.In.ReadLineAsync() is { } line)
    {
      var command = line.Trim();
      if (string.Equals(command, "pause", StringComparison.OrdinalIgnoreCase))
      {
        pauseState.SetPaused(true);
        continue;
      }
      if (string.Equals(command, "resume", StringComparison.OrdinalIgnoreCase))
      {
        pauseState.SetPaused(false);
        continue;
      }
      if (string.Equals(command, "stop", StringComparison.OrdinalIgnoreCase))
      {
        return;
      }
    }
  }

  private sealed class CapturePauseState
  {
    private int paused;

    public bool IsPaused => Volatile.Read(ref paused) == 1;

    public void SetPaused(bool nextPaused)
    {
      Volatile.Write(ref paused, nextPaused ? 1 : 0);
    }
  }

  private sealed class LevelReporter
  {
    private readonly Dictionary<string, DateTimeOffset> lastReportedAt = new(StringComparer.OrdinalIgnoreCase);
    private readonly object gate = new();

    public void Report(string track, byte[] buffer, int bytesRecorded, WaveFormat waveFormat)
    {
      var now = DateTimeOffset.UtcNow;
      lock (gate)
      {
        if (
          lastReportedAt.TryGetValue(track, out var lastReported) &&
          now - lastReported < TimeSpan.FromMilliseconds(500)
        )
        {
          return;
        }

        lastReportedAt[track] = now;
      }

      Console.WriteLine(
        string.Create(
          CultureInfo.InvariantCulture,
          $"LEVEL {track} {CalculateLevel(buffer, bytesRecorded, waveFormat):0.0000}"
        )
      );
    }

    private static double CalculateLevel(byte[] buffer, int bytesRecorded, WaveFormat waveFormat)
    {
      var bytesPerSample = Math.Max(1, waveFormat.BitsPerSample / 8);
      if (bytesRecorded < bytesPerSample)
      {
        return 0;
      }

      double sumSquares = 0;
      var sampleCount = 0;
      for (var index = 0; index + bytesPerSample <= bytesRecorded; index += bytesPerSample)
      {
        var sample = ReadSample(buffer, index, waveFormat);
        sumSquares += sample * sample;
        sampleCount++;
      }

      return sampleCount == 0
        ? 0
        : Math.Min(1, Math.Sqrt(sumSquares / sampleCount));
    }

    private static double ReadSample(byte[] buffer, int index, WaveFormat waveFormat)
    {
      if (waveFormat.Encoding == WaveFormatEncoding.IeeeFloat && waveFormat.BitsPerSample == 32)
      {
        return Math.Clamp(BitConverter.ToSingle(buffer, index), -1, 1);
      }

      if (waveFormat.Encoding != WaveFormatEncoding.Pcm)
      {
        return 0;
      }

      return waveFormat.BitsPerSample switch
      {
        8 => (buffer[index] - 128) / 128.0,
        16 => BitConverter.ToInt16(buffer, index) / 32768.0,
        24 => ReadInt24(buffer, index) / 8388608.0,
        32 => BitConverter.ToInt32(buffer, index) / 2147483648.0,
        _ => 0
      };
    }

    private static int ReadInt24(byte[] buffer, int index)
    {
      var value = buffer[index] | (buffer[index + 1] << 8) | (buffer[index + 2] << 16);
      return (value & 0x800000) != 0 ? value | unchecked((int)0xFF000000) : value;
    }
  }

  private static WaveInEvent CreateMicrophoneCapture(int? deviceNumber)
  {
    if (WaveInEvent.DeviceCount <= 0)
    {
      throw new InvalidOperationException("No microphone capture devices are available.");
    }

    var selectedDevice = deviceNumber ?? 0;
    if (selectedDevice >= WaveInEvent.DeviceCount)
    {
      throw new ArgumentException(
        $"Microphone device {selectedDevice} is not available. Found {WaveInEvent.DeviceCount} device(s)."
      );
    }

    return new WaveInEvent
    {
      DeviceNumber = selectedDevice,
      WaveFormat = new WaveFormat(48000, 16, 1)
    };
  }

  private static Task CreateStoppedTask(IWaveIn capture)
  {
    var stopped = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    capture.RecordingStopped += (_, eventArgs) =>
    {
      if (eventArgs.Exception is not null)
      {
        stopped.TrySetException(eventArgs.Exception);
        return;
      }

      stopped.TrySetResult();
    };
    return stopped.Task;
  }

  private static string? Optional(IReadOnlyDictionary<string, string> values, string key)
  {
    return values.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value)
      ? value
      : null;
  }

  private static double ParsePositiveDouble(string value, string key)
  {
    return double.TryParse(value, out var parsed) && parsed > 0
      ? parsed
      : throw new ArgumentException($"{key} must be a positive number.");
  }

  private static int ParseNonNegativeInt(string value, string key)
  {
    return int.TryParse(value, out var parsed) && parsed >= 0
      ? parsed
      : throw new ArgumentException($"{key} must be a non-negative integer.");
  }

  private static void ValidateWavFile(string path, string label)
  {
    var info = new FileInfo(path);
    if (!info.Exists || info.Length < 44)
    {
      throw new InvalidOperationException(
        $"The {label} WAV file was not created. Check that the source is available."
      );
    }
  }

  private static string Usage()
  {
    return """
      MeetMap Windows audio capture proof of concept

      Required:
        At least one audio output path:
        --system-output <path>       WAV file for WASAPI loopback system audio
        --microphone-output <path>   WAV file for selected microphone input

      Optional:
        --duration-seconds <number>  Capture duration, defaults to 10
        --microphone-device <index>  NAudio WaveIn device index, defaults to 0
        --wait-for-stdin-stop        Record until a "stop" line is received on stdin
        --help                       Show this help
      """;
  }
}
