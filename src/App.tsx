import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleMap } from './components/GoogleMap';
import { MapWrapper } from './components/MapWrapper';
import { MapProviderWrapper } from './contexts/MapContext';
// Assuming gemini-live-api.js is in src/services and exports GeminiLiveApi class
// Adjust the path and import name if necessary.
import { GeminiLiveAPI, GeminiLiveResponseMessage } from './services/gemini-live-api';

export default function App() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGuidanceActive, setIsGuidanceActive] = useState(false);
  // const [showMap, setShowMap] = useState(false); // showMap seems unused, consider removing
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [geminiApi, setGeminiApi] = useState<GeminiLiveAPI | null>(null);
  const [isApiConnected, setIsApiConnected] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCaptureIntervalRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null); // Ref to hold the current media stream
  const geminiApiRef = useRef<GeminiLiveAPI | null>(null); // Ref for API instance for cleanup

  const SYSTEM_INSTRUCTION_IMAGE_DESCRIPTION = "Please describe what you see in plain English";
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  // const FRAME_CAPTURE_INTERVAL_MS = 1000; // Send one frame per second for video streaming
  const FRAME_CAPTURE_INTERVAL_MS = 10000; // Testing sending a frame every 10 seconds

  // Initialize Gemini API instance
  useEffect(() => {
    try {
      // Replace with actual configuration for your GeminiLiveApi
      // TODO: Replace these placeholder values with your actual configuration
      const PROXY_URL = "ws://localhost:8080"; // Example: Your backend proxy to Gemini
      const PROJECT_ID = "consumer-genai-experiments";
      // const PROJECT_ID = "cloud-llm-preview1";
      const MODEL_NAME = "gemini-2.0-flash-live-preview-04-09"; // Or your specific model, e.g., gemini-pro-vision
      const API_HOST = "us-central1-aiplatform.googleapis.com"; // Or your specific region

      const api = new GeminiLiveAPI(PROXY_URL, PROJECT_ID, MODEL_NAME, API_HOST);
      api.systemInstructions = SYSTEM_INSTRUCTION_IMAGE_DESCRIPTION; // Set system instruction
      api.responseModalities = ["AUDIO"]; // Request AUDIO responses (or ["TEXT", "AUDIO"] if you want both)
      setGeminiApi(api);
    } catch (error) {
      console.error("Failed to initialize GeminiLiveApi:", error);
      alert("API initialization failed. Please check console.");
    }
  }, []); // Empty dependency array means this runs once on mount

  // Keep geminiApiRef updated
  useEffect(() => {
    geminiApiRef.current = geminiApi;
  }, [geminiApi]);

    // Main cleanup for the component unmount
  useEffect(() => {
    return () => {
      if (frameCaptureIntervalRef.current) {
        clearInterval(frameCaptureIntervalRef.current);
      }
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      if (geminiApiRef.current?.webSocket && geminiApiRef.current.webSocket.readyState === WebSocket.OPEN) {
        // Clean up AudioWorkletNode and AudioContext
        audioWorkletNodeRef.current?.disconnect();
        audioWorkletNodeRef.current = null;
        audioContextRef.current?.close().catch(err => console.error("Error closing AudioContext:", err));
        audioContextRef.current = null;
        geminiApiRef.current.disconnect();
      }
    };
  }, []); // Empty dependency array for unmount cleanup

  // Effect to set up API callbacks when geminiApi instance is ready
  useEffect(() => {
    if (!geminiApi) return;

    geminiApi.onConnectionStarted = async () => { // Made async for initializeAudio
      console.log("Gemini API connected successfully.");
      setIsApiConnected(true);
    };

    geminiApi.onReceiveResponse = (message: GeminiLiveResponseMessage) => {
      console.log("Full Gemini Message Received:", message); // Logs the whole message object

      if (message.type === "TEXT" && message.data) {
        console.log("Gemini Text Response:", message.data); // Specifically logs the text data
        // TODO: You could also update a state here to display this text in your UI
        // alert(`Gemini: ${message.data}`);
      } else if (message.type === "AUDIO" && message.data) {
        playPcmAudio(message.data);
      }
    };

    geminiApi.onErrorMessage = (errorMsg: string) => {
      console.error("Gemini API connection error:", errorMsg);
      alert(`Gemini API Error: ${errorMsg}`);
      setIsApiConnected(false);
      setIsStreaming(false); // Stop streaming indication on API error
      mediaStreamRef.current?.getTracks().forEach(track => track.stop()); // Stop camera
      setStream(null);
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    geminiApi.onDisconnected = () => {
      console.log("Gemini API disconnected.");
      setIsApiConnected(false);
      // Consider if setIsStreaming(false) is needed here for unexpected disconnections
    };

  }, [geminiApi]); // Re-run if geminiApi instance changes

  const initializeAudioPlayback = useCallback(async () => {
    if (audioContextRef.current && audioWorkletNodeRef.current) {
      // Already initialized
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume().catch(err => console.error("Error resuming AudioContext:", err));
      }
      return;
    }

    console.log("Initializing AudioContext and Worklet...");
    try {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = context;

      await context.audioWorklet.addModule('/pcm-processor.js'); // Path relative to public folder
      const workletNode = new AudioWorkletNode(context, 'pcm-processor', {
        processorOptions: { sampleRate: 24000 } // Pass sample rate to processor if needed
      });
      workletNode.connect(context.destination);
      audioWorkletNodeRef.current = workletNode;

      console.log("AudioContext and Worklet initialized successfully.");
    } catch (error) {
      console.error("Failed to initialize audio playback:", error);
      // Fallback or error display
    }
  }, []);

  const playPcmAudio = useCallback(async (base64PcmData: string) => {
    if (!audioWorkletNodeRef.current || !audioContextRef.current) {
      console.warn("AudioWorkletNode or AudioContext not initialized. Cannot play audio.");
      return;
    }
    try {
      // 1. Decode Base64 to ArrayBuffer
      const binaryString = window.atob(base64PcmData);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pcmArrayBuffer = bytes.buffer;

      // 2. Convert ArrayBuffer (assuming 16-bit PCM) to Float32Array
      // The DataView object is needed to correctly interpret little-endian 16-bit integers.
      const dataView = new DataView(pcmArrayBuffer);
      const numSamples = pcmArrayBuffer.byteLength / 2; // 2 bytes per 16-bit sample
      const pcmFloat32Array = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        // Read a 16-bit signed integer at byte offset i*2, as little-endian
        const int16Sample = dataView.getInt16(i * 2, true); // true for little-endian
        pcmFloat32Array[i] = int16Sample / 32768.0; // Normalize to -1.0 to 1.0
      }

      // Send the Float32Array to the AudioWorkletProcessor
      if (pcmFloat32Array.length > 0) {
        audioWorkletNodeRef.current.port.postMessage(pcmFloat32Array);
      }
    } catch (error) {
      console.error("Error playing PCM audio:", error);
    }
  }, []); // audioContextRef will be stable via ref

  // 语音输入控制
  const startVoiceInput = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        alert(`设置目的地: ${text}`);
      };

      recognition.onerror = (event) => {
        console.error('语音识别错误:', event.error);
        alert('语音识别失败，请重试');
      };

      recognition.start();
    } else {
      alert('您的浏览器不支持语音识别');
    }
  };

  const captureAndSendFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !geminiApi || !isApiConnected || !stream) {
      return;
    }
    if (videoRef.current.readyState < videoRef.current.HAVE_METADATA || videoRef.current.videoWidth === 0) {
      return;
    }

    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;

    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    const context = canvasElement.getContext('2d');
    if (context) {
      context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
      const dataUrl = canvasElement.toDataURL('image/jpeg', 0.8); // Use JPEG, 80% quality
      const base64ImageData = dataUrl.split(',')[1]; // Extract base64 data

      if (base64ImageData) {
        geminiApi.sendImageMessage(base64ImageData, 'image/jpeg');

        // Also send text message to prompt the Gemini
        geminiApi.sendTextMessage("Please describe what you see in English");
        console.log("Attempting to send video frame to Gemini API"); // Added for debugging
      }
    }
  }, [geminiApi, isApiConnected, stream]);

  // Effect to manage frame capture interval and video element srcObject
  useEffect(() => {
    if (isStreaming && isApiConnected && stream && videoRef.current) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(err => console.error("Error playing video:", err));
      }
      
      if (frameCaptureIntervalRef.current) clearInterval(frameCaptureIntervalRef.current);
      frameCaptureIntervalRef.current = window.setInterval(captureAndSendFrame, FRAME_CAPTURE_INTERVAL_MS);
    } else {
      if (frameCaptureIntervalRef.current) {
        clearInterval(frameCaptureIntervalRef.current);
        frameCaptureIntervalRef.current = null;
      }
    }
    // Cleanup for this specific effect
    return () => {
      if (frameCaptureIntervalRef.current) {
        clearInterval(frameCaptureIntervalRef.current);
      }
    };
  }, [isStreaming, isApiConnected, stream, captureAndSendFrame, FRAME_CAPTURE_INTERVAL_MS]);

  // Combined function to toggle camera stream and API connection
  const toggleStreamAndApi = async () => {
    if (!geminiApi) {
      alert("Gemini API is not initialized. Please wait or refresh.");
      return;
    }

    if (!isStreaming) { // ---- START STREAMING ----
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        mediaStreamRef.current = mediaStream; // Store in ref
        setStream(mediaStream); // Set stream state for video element
        setIsStreaming(true); // Indicate user has initiated streaming

        await initializeAudioPlayback(); // Initialize or resume audio context and worklet

        // Call connect. Callbacks on the geminiApi instance will handle state changes.
        // You can pass an access token if your API requires it: geminiApi.connect(your_access_token);
        geminiApi.connect();

      } catch (error) { // This catch is for getUserMedia errors
        console.error('摄像头访问错误:', error);
        alert('无法访问摄像头，请确保已授予权限');
        setIsStreaming(false); // Ensure states are reset
        setIsApiConnected(false);
        mediaStreamRef.current = null;
        setStream(null);
      }
    } else { // ---- STOP STREAMING ----
      if (frameCaptureIntervalRef.current) clearInterval(frameCaptureIntervalRef.current);
      frameCaptureIntervalRef.current = null;

      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
      setStream(null);
      if (videoRef.current) videoRef.current.srcObject = null;

      if (geminiApi.webSocket && geminiApi.webSocket.readyState === WebSocket.OPEN) {
        geminiApi.disconnect(() => console.log("Gemini API disconnected by user."));
      }
      setIsApiConnected(false); // Explicitly set on user stop
      setIsStreaming(false);
    }
  };

  const defaultLocation: [number, number] = [40.7580, -73.9855];
  const [activeTab, setActiveTab] = useState('controls');

  // Add effect to handle automatic map switching
  useEffect(() => {
    if (isGuidanceActive) {
      setActiveTab('map');
    }
  }, [isGuidanceActive]);

  return (
    <MapProviderWrapper>
      <div className="h-screen w-screen bg-black text-white overflow-hidden">
        {/* Hidden video and canvas elements for frame capture */}
        <video ref={videoRef} style={{ display: 'none' }} playsInline muted></video>
        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

        {/* Main content area */}
        <div className="h-[calc(100vh-4rem)] relative">
          {/* Control panel view */}
          <div 
            className={`absolute inset-0 p-4 space-y-4 overflow-y-auto transform transition-transform duration-300 ease-in-out bg-black ${
              activeTab === 'controls' ? 'translate-x-0' : '-translate-x-full'
            }`}
            style={{ backfaceVisibility: 'hidden' }}
          >
            <button
              className="w-full min-h-[3.5rem] p-4 bg-blue-600 rounded-lg text-lg font-bold focus:ring-4 focus:ring-blue-400 active:bg-blue-700 transition-colors touch-manipulation"
              onClick={toggleStreamAndApi}
              aria-pressed={isStreaming}
              disabled={!geminiApi} // Disable if API not ready
            >
              {isStreaming ? "停止实时流" : "开始实时流"}
            </button>

            <button
              className="w-full min-h-[3.5rem] p-4 bg-green-600 rounded-lg text-lg font-bold focus:ring-4 focus:ring-green-400 active:bg-green-700 transition-colors touch-manipulation"
              onClick={() => setIsGuidanceActive(!isGuidanceActive)}
              aria-pressed={isGuidanceActive}
            >
              {isGuidanceActive ? "关闭导航模式" : "启用导航模式"}
            </button>

            <div 
              role="status" 
              aria-live="polite"
              className="p-4 bg-gray-800 rounded-lg"
            >
              {!geminiApi && <p>正在初始化 API...</p>}
              {geminiApi && !isStreaming && <p>实时流已停止。点击开始。</p>}
              {isStreaming && !isApiConnected && <p>摄像头已启动，正在连接 Gemini API...</p>}
              {isStreaming && isApiConnected && <p>实时流已连接并正在发送至 Gemini。</p>}
              {isGuidanceActive && <p>导航模式已激活</p>}
            </div>

            <button
              className="w-full min-h-[3.5rem] p-4 bg-purple-600 rounded-lg text-lg font-bold focus:ring-4 focus:ring-purple-400 active:bg-purple-700 transition-colors touch-manipulation"
              onClick={startVoiceInput}
            >
              <span role="img" aria-hidden="true">🎤</span> 语音输入目的地
            </button>
          </div>

          {/* Map view */}
          <div 
            className={`absolute inset-0 transform transition-transform duration-300 ease-in-out ${
              activeTab === 'map' ? 'translate-x-0' : 'translate-x-full'
            }`}
            style={{ backfaceVisibility: 'hidden' }}
          >
            <MapWrapper 
              center={defaultLocation}
              zoom={15}
              isVisible={activeTab === 'map'}
            />
          </div>
        </div>

        {/* Bottom navigation bar */}
        <div className="fixed bottom-0 left-0 right-0 h-16 bg-gray-900 flex justify-around items-center shadow-lg">
          <button
            className={`flex-1 h-full flex items-center justify-center ${activeTab === 'controls' ? 'text-blue-500' : 'text-gray-400'}`}
            onClick={() => setActiveTab('controls')}
          >
            <span className="text-2xl">🎛️</span>
            <span className="ml-2">控制台</span>
          </button>
          <button
            className={`flex-1 h-full flex items-center justify-center ${activeTab === 'map' ? 'text-blue-500' : 'text-gray-400'}`}
            onClick={() => setActiveTab('map')}
          >
            <span className="text-2xl">🗺️</span>
            <span className="ml-2">地图</span>
          </button>
        </div>
      </div>
    </MapProviderWrapper>
  );
}
