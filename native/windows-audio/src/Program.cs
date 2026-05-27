using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace MeetMap.WindowsAudio;

internal sealed record CaptureOptions(
  string SystemOutputPath,
  string MicrophoneOutputPath,
  TimeSpan Duration,
  int? MicrophoneDeviceNumber
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
      Console.WriteLine($"System audio: {options.SystemOutputPath}");
      Console.WriteLine($"Microphone: {options.MicrophoneOutputPath}");
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

    for (var index = 0; index < args.Length; index++)
    {
      var key = args[index];
      if (!key.StartsWith("--", StringComparison.Ordinal))
      {
        throw new ArgumentException($"Unexpected positional argument: {key}");
      }

      if (index + 1 >= args.Length || args[index + 1].StartsWith("--", StringComparison.Ordinal))
      {
        throw new ArgumentException($"Missing value for {key}");
      }

      values[key] = args[++index];
    }

    var systemOutput = Required(values, "--system-output");
    var microphoneOutput = Required(values, "--microphone-output");
    var durationSeconds = values.TryGetValue("--duration-seconds", out var durationValue)
      ? ParsePositiveDouble(durationValue, "--duration-seconds")
      : 10;
    int? microphoneDeviceNumber = values.TryGetValue("--microphone-device", out var deviceValue)
      ? ParseNonNegativeInt(deviceValue, "--microphone-device")
      : null;

    return new CaptureOptions(
      Path.GetFullPath(systemOutput),
      Path.GetFullPath(microphoneOutput),
      TimeSpan.FromSeconds(durationSeconds),
      microphoneDeviceNumber
    );
  }

  private static async Task CaptureAsync(CaptureOptions options)
  {
    Directory.CreateDirectory(Path.GetDirectoryName(options.SystemOutputPath) ?? ".");
    Directory.CreateDirectory(Path.GetDirectoryName(options.MicrophoneOutputPath) ?? ".");

    using var systemCapture = new WasapiLoopbackCapture();
    using var microphoneCapture = CreateMicrophoneCapture(options.MicrophoneDeviceNumber);
    using var systemWriter = new WaveFileWriter(options.SystemOutputPath, systemCapture.WaveFormat);
    using var microphoneWriter = new WaveFileWriter(options.MicrophoneOutputPath, microphoneCapture.WaveFormat);

    var systemStopped = CreateStoppedTask(systemCapture);
    var microphoneStopped = CreateStoppedTask(microphoneCapture);

    systemCapture.DataAvailable += (_, eventArgs) =>
      systemWriter.Write(eventArgs.Buffer, 0, eventArgs.BytesRecorded);
    microphoneCapture.DataAvailable += (_, eventArgs) =>
      microphoneWriter.Write(eventArgs.Buffer, 0, eventArgs.BytesRecorded);

    systemCapture.StartRecording();
    microphoneCapture.StartRecording();

    await Task.Delay(options.Duration);

    systemCapture.StopRecording();
    microphoneCapture.StopRecording();
    await Task.WhenAll(systemStopped, microphoneStopped);

    systemWriter.Flush();
    microphoneWriter.Flush();
    ValidateWavFile(options.SystemOutputPath, "system");
    ValidateWavFile(options.MicrophoneOutputPath, "microphone");
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

  private static string Required(IReadOnlyDictionary<string, string> values, string key)
  {
    return values.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value)
      ? value
      : throw new ArgumentException($"Missing required argument {key}");
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
    if (!info.Exists || info.Length <= 44)
    {
      throw new InvalidOperationException(
        $"The {label} WAV file was not created with audio data. Check that the source is available."
      );
    }
  }

  private static string Usage()
  {
    return """
      MeetMap Windows audio capture proof of concept

      Required:
        --system-output <path>       WAV file for WASAPI loopback system audio
        --microphone-output <path>   WAV file for selected microphone input

      Optional:
        --duration-seconds <number>  Capture duration, defaults to 10
        --microphone-device <index>  NAudio WaveIn device index, defaults to 0
        --help                       Show this help
      """;
  }
}
