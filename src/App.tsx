import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleMap } from './components/GoogleMap';
import { MapProviderWrapper, useMap } from './contexts/MapContext';
// Assuming gemini-live-api.js is in src/services and exports GeminiLiveApi class
// Adjust the path and import name if necessary.
import { GeminiLiveAPI, GeminiLiveResponseMessage } from './services/gemini-live-api';

// Define AppContent which will consume the map context
function AppContent() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGuidanceActive, setIsGuidanceActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [geminiApi, setGeminiApi] = useState<GeminiLiveAPI | null>(null);
  const [isApiConnected, setIsApiConnected] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCaptureIntervalRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null); // Ref to hold the current media stream
  const geminiApiRef = useRef<GeminiLiveAPI | null>(null); // Ref for API instance for cleanup

  // const SYSTEM_INSTRUCTION_IMAGE_DESCRIPTION = "Please describe what you see in plain English";
  const SYSTEM_INSTRUCTION_IMAGE_DESCRIPTION = `
  You are an advanced AI navigation assistant for a user who is blind or visually impaired.
  Your primary mission is to provide real-time, clear, concise, 
  and actionable audio guidance to ensure their safety 
  and enable smooth outdoor walking navigation. 
  You will continuously receive a live video feed from their camera.

  **CORE DIRECTIVES:**

  1.  **PRIORITIZE SAFETY & IMMEDIATE OBSTACLES (CRITICAL):**
      * Proactively identify and immediately announce any potential hazards or obstacles directly in the user's path or immediate vicinity. Use clear, urgent language.
      * Examples: "Stop. Curb ahead." "Caution, low-hanging branch on your right." "Pole directly in front." "Uneven pavement, watch your step." "Stairs going down, three steps." "Warning, bicycle approaching quickly from your left." "Large puddle covering the sidewalk."
      * Specify the location of the obstacle relative to the user (e.g., "to your left," "directly ahead," "slightly to your right," "two steps in front").
      * If an obstacle is no longer a threat, confirm: "Obstacle cleared."

  2.  **ENVIRONMENTAL AWARENESS (CONCISE & RELEVANT):**
      * Briefly describe significant, fixed elements of the surroundings that help with orientation or awareness, especially as the user approaches them.
      * Examples: "Approaching an intersection." "Storefront on your right with an open door." "Park bench to your left." "Building wall directly to your right." "Mailbox ahead on the sidewalk."
      * Mention dynamic elements if relevant to safety or navigation: "Several people walking towards you." "Dog on a leash approaching on your left."

  3.  **TRAFFIC & INTERSECTIONS:**
      * Announce arrival at intersections: "You've reached an intersection."
      * Describe traffic light status if clearly visible and relevant: "Crosswalk light shows 'Walk'." or "Traffic light for your direction is red." (Only if confident from visual input).
      * Describe traffic conditions: "Traffic moving on your left." "Sounds like light traffic ahead." "Car turning right in front of you."

  4.  **TEXT & SIGN READING (PROACTIVE & ON-DEMAND):**
      * If a clear, large sign is in the direct field of view and seems relevant to navigation or points of interest, read its primary text proactively. Example: "Sign ahead says 'Elm Street'."
      * Be prepared to read signs or text if the user asks (e.g., "Read that sign for me").

  5.  **INTEGRATE NAVIGATION CUES (WHEN PROVIDED):**
      * The application may periodically provide you with the next turn-by-turn instruction from a mapping service (e.g., "Next step: Turn right onto Oak Avenue").
      * When you receive such an instruction, integrate it naturally with your real-time environmental observations.
      * Example: If user is approaching a corner and the app sends "Turn right onto Oak Avenue," you might say: "Corner approaching. I see a street sign for Oak Avenue. Google Maps says: Turn right onto Oak Avenue."

  6.  **INTERACTIVE Q&A:**
      * Listen for user questions captured by the microphone (e.g., "What's that sound?", "Is there a bench nearby?", "How many people are in front of me?").
      * Answer concisely and accurately based on the current audio-visual feed. If you cannot determine the answer, say so clearly (e.g., "I cannot see that clearly right now.").

  **COMMUNICATION STYLE:**

  * **Clarity & Conciseness:** Use simple, direct language. Avoid jargon or overly complex sentences. Brevity is key, especially for urgent alerts.
  * **Calm & Reassuring Tone:** Maintain a calm, steady, and reassuring tone in your synthesized voice output.
  * **Directional Language:** Use clear relative directions (left, right, ahead, behind, slightly to your left/right). Clock-face directions (e.g., "obstacle at your 2 o'clock") can also be useful if the user is trained for it, but start with simpler terms.
  * **Timeliness:** Provide information when it's most relevant. Obstacle warnings must be immediate. Descriptions of upcoming features should be given with enough time for the user to react.
  * **Confirmation (Optional, based on testing):** For critical actions or information, you might briefly ask for user confirmation or state what you are perceiving clearly.
  * **Don't Overwhelm:** Avoid constant chatter. Prioritize safety-critical information. Provide ambient details more sparingly or when the environment is less dynamic.

  **IMPORTANT OPERATIONAL NOTES:**

  * Assume the user is walking.
  * Continuously analyze the video and audio feed.
  * Be prepared for the user to interrupt you.
  * If you lose visual clarity or are unsure about something critical for safety, state your uncertainty and advise caution. Example: "Visual is unclear, proceed with caution."
  * You are an aid; the user retains ultimate responsibility for their movement.
  `;
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  // const FRAME_CAPTURE_INTERVAL_MS = 1000; // Send one frame per second for video streaming
  const FRAME_CAPTURE_INTERVAL_MS = 10000; // Testing sending a frame every 10 seconds

  const {
    currentLocation, // Use from context
    setDestination,
    setDirectionsResult,
    setIsNavigating: setContextIsNavigating // Renamed to avoid conflict
  } = useMap();

  // Initialize Gemini API instance
  useEffect(() => {
    try {
      // Replace with actual configuration for your GeminiLiveApi
      // TODO: Replace these placeholder values with your actual configuration
      const PROXY_URL = "ws://localhost:8080"; // Example: Your backend proxy to Gemini
      const PROJECT_ID = "";
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

  // Voice input control
  const startVoiceInput = () => {
    if (!window.google || !window.google.maps || !window.google.maps.DirectionsService) {
      alert("Google Maps API not loaded yet. Please try viewing the map first or try again shortly.");
      return;
    }

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      console.log("Starting voice recognition...");

      recognition.onresult = (event) => {
        const destinationText = event.results[0][0].transcript;
        console.log(`Destination recognized: ${destinationText}`);
        // alert(`Heard: ${destinationText}. Getting directions...`);

        const directionsService = new google.maps.DirectionsService();
        const request: google.maps.DirectionsRequest = {
          origin: { lat: currentLocation[0], lng: currentLocation[1] },
          destination: destinationText,
          travelMode: google.maps.TravelMode.DRIVING, // Or WALKING, BICYCLING
        };

        directionsService.route(request, (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            console.log("Directions received:", result);
            setDirectionsResult(result);
            if (result.routes[0] && result.routes[0].legs[0] && result.routes[0].legs[0].end_location) {
              const endLocation = result.routes[0].legs[0].end_location;
              setDestination([endLocation.lat(), endLocation.lng()]);
            }
            setIsGuidanceActive(true); // This will also trigger map tab switch via useEffect
            setContextIsNavigating(true); // Update context
            setActiveTab('map'); // Switch to map tab immediately
            // alert("Route found! Check the map.");
          } else {
            console.error(`Directions request failed due to ${status}`);
            alert(`Could not get directions for "${destinationText}". Error: ${status}`);
            setDirectionsResult(null); // Clear any previous directions
          }
        });
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        alert(`Speech recognition error: ${event.error}. Please try again.`);
      };

      recognition.start();
    } else {
      alert('Your browser does not support speech recognition.');
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
        // geminiApi.sendTextMessage("Please describe what you see following system instruction");
        geminiApi.sendTextMessage(SYSTEM_INSTRUCTION_IMAGE_DESCRIPTION);
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

  const [activeTab, setActiveTab] = useState('controls');

  // Effect to handle automatic map switching and sync context navigation state
  useEffect(() => {
    if (isGuidanceActive) {
      setActiveTab('map');
      setContextIsNavigating(true);
    } else {
      // If guidance is stopped externally, ensure context is updated
      setContextIsNavigating(false);
    }
  }, [isGuidanceActive]);

  return (
    // This JSX was previously directly inside App's return, now it's in AppContent
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
              {isStreaming ? "Stop Streaming" : "Start Streaming"}
            </button>

            <button
              className="w-full min-h-[3.5rem] p-4 bg-green-600 rounded-lg text-lg font-bold focus:ring-4 focus:ring-green-400 active:bg-green-700 transition-colors touch-manipulation"
              onClick={() => {
                const newGuidanceState = !isGuidanceActive;
                setIsGuidanceActive(newGuidanceState);
                if (!newGuidanceState) { // If stopping navigation
                  setDirectionsResult(null); // Clear directions
                  setDestination(null);
                }
              }}
              aria-pressed={isGuidanceActive}
            >
              {isGuidanceActive ? "Stop Navigation" : "Start Navigation"}
            </button>

            <div 
              role="status" 
              aria-live="polite"
              className="p-4 bg-gray-800 rounded-lg"
            >
              {!geminiApi && <p>Initializing API...</p>}
              {geminiApi && !isStreaming && <p>Streaming stopped。click to start。</p>}
              {isStreaming && !isApiConnected && <p>Camera started, connecting to Gemini API...</p>}
              {isStreaming && isApiConnected && <p>Streaming to Gemini。</p>}
              {isGuidanceActive && <p>Navigation started</p>}
            </div>

            <button
              className="w-full min-h-[3.5rem] p-4 bg-purple-600 rounded-lg text-lg font-bold focus:ring-4 focus:ring-purple-400 active:bg-purple-700 transition-colors touch-manipulation"
              onClick={startVoiceInput}
            >
              <span role="img" aria-hidden="true">🎤</span> Say Destination 
            </button>
          </div>

          {/* Map view */}
          <div 
            className={`absolute inset-0 transform transition-transform duration-300 ease-in-out ${
              activeTab === 'map' ? 'translate-x-0' : 'translate-x-full'
            }`}
            style={{ backfaceVisibility: 'hidden' }}
          >
            <GoogleMap
              center={currentLocation} // Use dynamic current location
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
            <span className="ml-2">Control</span>
          </button>
          <button
            className={`flex-1 h-full flex items-center justify-center ${activeTab === 'map' ? 'text-blue-500' : 'text-gray-400'}`}
            onClick={() => setActiveTab('map')}
          >
            <span className="text-2xl">🗺️</span>
            <span className="ml-2">Map</span>
          </button>
        </div>
      </div>
  );
}

// The main App component now sets up the provider
export default function App() {
  return (
    <MapProviderWrapper>
      <AppContent />
    </MapProviderWrapper>
  );
}
