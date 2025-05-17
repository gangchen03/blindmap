// Placeholder for the actual prompt, initialize as needed
const prompt: string = "Please describe what you see in plain English";

// --- Type Definitions (assumed or basic) ---

interface Device {
    id: string;
    name: string;
}

type AppStatus = "disconnected" | "connecting" | "connected" | "speaking";
type MicIconState = "listening" | "microphone";
type ResponseModalityType = "TEXT" | "AUDIO"; // More specific than just string

interface GeminiLiveResponseMessage {
    type: ResponseModalityType | "SETUP COMPLETE" | ""; // Allow for other potential types
    data: string;
    // endOfTurn?: boolean; // Consider if this is part of the message structure
}

interface GeminiLiveAPIInstance {
    responseModalities: ResponseModalityType[];
    systemInstructions: string;
    onErrorMessage: (message: string) => void;
    onConnectionStarted: () => void;
    onReceiveResponse: (messageResponse: GeminiLiveResponseMessage) => void;
    setProjectId: (projectId: string) => void;
    connect: (accessToken?: string) => void;
    disconnect: (onDisconnectedCallback?: () => void) => void;
    sendAudioMessage: (audioData: string) => void;
    sendImageMessage: (base64Image: string, mime_type?: string) => void;
}

interface LiveAudioOutputManagerInstance {
    playAudioChunk: (data: string) => void;
}

interface LiveAudioInputManagerInstance {
    onDisconnected: () => void;
    onNewAudioRecordingChunk: (audioData: string) => void;
    connectMicrophone: () => void;
    disconnectMicrophone: () => void;
}

// Assume these classes are defined globally or imported elsewhere
// If they are in other .ts files, you would import them.
declare class GeminiLiveAPI implements GeminiLiveAPIInstance {
    constructor(proxyUrl: string, projectId: string, model: string, apiHost: string);
    responseModalities: ResponseModalityType[];
    systemInstructions: string;
    onErrorMessage: (message: string) => void;
    onConnectionStarted: () => void;
    onReceiveResponse: (messageResponse: GeminiLiveResponseMessage) => void;
    setProjectId: (projectId: string) => void;
    connect: (accessToken?: string) => void;
    disconnect: (onDisconnectedCallback?: () => void) => void;
    sendAudioMessage: (audioData: string) => void;
    sendImageMessage: (base64Image: string, mime_type?: string) => void;
}

declare class LiveAudioOutputManager implements LiveAudioOutputManagerInstance {
    constructor();
    playAudioChunk: (data: string) => void;
}

declare class LiveAudioInputManager implements LiveAudioInputManagerInstance {
    constructor();
    onDisconnected: () => void;
    onNewAudioRecordingChunk: (audioData: string) => void;
    connectMicrophone: () => void;
    disconnectMicrophone: () => void;
}

// For Material Design Web Components
interface MdListItemElement extends HTMLElement { value: string; }
interface MdSelectOptionElement extends HTMLElement { value: string; } // Assuming it has a value property
interface MdDialogElement extends HTMLElement { show: () => void; close: () => void; }
interface MdInputElement extends HTMLInputElement { value: string; } // For elements like selected-modality

// For local testing
const PROXY_URL: string = "ws://localhost:8080";
const PROJECT_ID: string = "consumer-genai-experiments";

// Cloud Run Deploy
// const PROXY_URL = "/ws";  // cloud run deployment
// const PROJECT_ID = "gchen-sandbox";

// const MODEL = "gemini-2.0-flash-exp";
const MODEL: string = "gemini-2.0-flash-live-preview-04-09";
const API_HOST: string = "us-central1-aiplatform.googleapis.com";

// const accessTokenInput: HTMLInputElement | null = null; // If it were an input element
const projectInput: { value: string } = { value: PROJECT_ID };
const systemInstructionsInput: { value: string } = { value: prompt };

// Video capture variables
let videoElement: HTMLVideoElement | null = null;
let canvasElement: HTMLCanvasElement | null = null;
let videoStream: MediaStream | null = null;
let frameCaptureInterval: number | null = null;
const FRAME_CAPTURE_INTERVAL_MS = 1000; // Send one frame per second, matches App.tsx

const micButton: HTMLButtonElement | null = document.getElementById("mic-button") as HTMLButtonElement | null;
const micIcon: HTMLElement | null = micButton ? micButton.querySelector("i") : null;

const geminiLiveApi: GeminiLiveAPIInstance = new GeminiLiveAPI(PROXY_URL, PROJECT_ID, MODEL, API_HOST);

geminiLiveApi.onErrorMessage = (message: string): void => {
    showDialogWithMessage(message);
    setAppStatus("disconnected");
};

const disconnected: HTMLElement | null = document.getElementById("disconnected");
const connecting: HTMLElement | null = document.getElementById("connecting");
const connected: HTMLElement | null = document.getElementById("connected");
const speaking: HTMLElement | null = document.getElementById("speaking");

// Buffering variables
let responseBuffer: string = "";
let responseTimeout: number | null = null; // setTimeout returns a number in Node, NodeJS.Timeout in browser
const COMPLETION_TIMEOUT: number = 1000; // Timeout in milliseconds (1 second)

window.addEventListener("load", (_event: Event): void => {
    console.log("Hello Gemini Realtime Demo!");

    // Initialize video and canvas elements
    videoElement = document.getElementById("cameraFeed") as HTMLVideoElement | null;
    canvasElement = document.getElementById("frameCanvas") as HTMLCanvasElement | null;

    setAvailableCamerasOptions();
    setAvailableMicrophoneOptions();
    initMicButtonClick(); // Initialize the click handler for mic-button
    initSettingsButtonClick(); // Initialize the click handler for settings-button
    initLanguageSelect();
    initModalitySelect();
});

function getSelectedResponseModality(): ResponseModalityType {
    const selectedModalityEl = document.getElementById("selected-modality") as MdInputElement | null;
    return (selectedModalityEl?.value as ResponseModalityType) || "TEXT"; // Default to TEXT if not found or invalid
}

function setSelectedResponseModality(modality: ResponseModalityType): void {
    const selectedModalityEl = document.getElementById("selected-modality") as MdInputElement | null;
    if (selectedModalityEl) {
        selectedModalityEl.value = modality;
    }
}

function initModalitySelect(): void {
    const modalityDialog = document.getElementById("modality-dialog") as MdDialogElement | null;
    const modalityList = document.getElementById("modality-list");

    if (modalityDialog && modalityList) {
        modalityList.addEventListener("click", (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const listItem = target.closest("md-list-item") as MdListItemElement | null;
            if (listItem) {
                // const selectedModalityText = listItem.querySelector<HTMLElement>('[slot="headline"]')?.textContent;
                const selectedModalityValue = listItem.getAttribute("value") as ResponseModalityType | null;

                if (selectedModalityValue) {
                    setSelectedResponseModality(selectedModalityValue);
                    geminiLiveApi.responseModalities = [selectedModalityValue];
                    updateTranscriptionText(" "); // clear existing transcription
                    modalityDialog.close();
                }
            }
        });
    }
}

function initSettingsButtonClick(): void {
    const settingsButton = document.getElementById("settings-button");
    const modalityDialog = document.getElementById("modality-dialog") as MdDialogElement | null;

    if (settingsButton && modalityDialog) {
        settingsButton.addEventListener("click", () => {
            modalityDialog.show();
        });
    }

    // Set the default modality on init
    geminiLiveApi.responseModalities = [getSelectedResponseModality()];
}

function updatePrompt(): void {
    const sourceLanguage = document.getElementById("source-select-button")?.textContent || "English";
    const targetLanguage = document.getElementById("target-select-button")?.textContent || "Spanish";
    // const prompt = `You are a professional translator. Please ONLY translate the incoming audio from ${sourceLanguage} to ${targetLanguage}, do NOT answer the question and respond with your thought. Strictly translate the input audio to ${targetLanguage} then response in Audio. Please do not ask any follow up questions or instruction. Only output the translated audio.`;
    
    const prompt = `You are a non-interactive audio translation engine. Your sole purpose is to translate audio from ${sourceLanguage} to ${targetLanguage}.  The ONLY output allowed is the translated audio or text transcription in ${targetLanguage}. Any other output (text, explanations, conversational responses) is strictly prohibited.`;
    systemInstructionsInput.value = prompt;
}

function getSystemInstructions(): string {
    return systemInstructionsInput.value;
}

function initLanguageSelect(): void {
    const sourceSelectButton = document.getElementById("source-select-button") as HTMLButtonElement | null;
    const targetSelectButton = document.getElementById("target-select-button") as HTMLButtonElement | null;
    const languageDialog = document.getElementById("language-dialog") as MdDialogElement | null;
    const languageList = document.getElementById("language-list");

    let currentLanguageButton: HTMLButtonElement | null = null;

    if (sourceSelectButton && languageDialog) {
        sourceSelectButton.addEventListener("click", () => {
            currentLanguageButton = sourceSelectButton;
            languageDialog.show();
        });
    }

    if (targetSelectButton && languageDialog) {
        targetSelectButton.addEventListener("click", () => {
            currentLanguageButton = targetSelectButton;
            languageDialog.show();
        });
    }

    if (languageList && languageDialog) {
        languageList.addEventListener("click", (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const listItem = target.closest("md-list-item") as MdListItemElement | null;
            if (listItem) {
                const selectedLanguageText = listItem.querySelector<HTMLElement>('[slot="headline"]')?.textContent;
                const selectedLanguageValue = listItem.getAttribute("value");

                if (currentLanguageButton && selectedLanguageText && selectedLanguageValue) {
                    currentLanguageButton.textContent = selectedLanguageText;
                    currentLanguageButton.setAttribute("value", selectedLanguageValue);
                    updatePrompt();
                    languageDialog.close();
                }
            }
        });
    }
}

function connectBtnClick(): void {

    updatePrompt();
    setAppStatus("connecting");

    // geminiLiveApi.responseModalities = getSelectedResponseModality();
    geminiLiveApi.systemInstructions = getSystemInstructions();

    geminiLiveApi.onConnectionStarted = (): void => {
        setAppStatus("connected");
        // startAudioInput(); // Audio input will be started by initMicButtonClick logic
        startVideoInput(); // Start video input when connected
        updateMicIcon("listening");
    };

    geminiLiveApi.setProjectId(projectInput.value);
    geminiLiveApi.connect();
}

const liveAudioOutputManager: LiveAudioOutputManagerInstance = new LiveAudioOutputManager();

geminiLiveApi.onReceiveResponse = (messageResponse: GeminiLiveResponseMessage): void => {
    if (messageResponse.type == "AUDIO") {
        liveAudioOutputManager.playAudioChunk(messageResponse.data);
    } else if (messageResponse.type == "TEXT") {
        console.log("Gemini said: ", messageResponse.data);
        
        // Accumulate chunks
        responseBuffer += messageResponse.data;

        // Reset timeout on each chunk received
        clearTimeout(responseTimeout);

        // Set a new timeout to process the buffer after a pause
        responseTimeout = setTimeout(() => {
            if (typeof responseTimeout === 'number') clearTimeout(responseTimeout); // Clear existing if any
            updateTranscriptionText(responseBuffer);
            responseBuffer = ""; // Clear the buffer
        }, COMPLETION_TIMEOUT);
    }
};

function startVideoInput(): void {
    if (!videoElement || !canvasElement) {
        console.error("Video or canvas element not found for video input.");
        return;
    }
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true, audio: false }) // Request video only
            .then((stream) => {
                videoStream = stream;
                if (videoElement) {
                    videoElement.srcObject = stream;
                    videoElement.play().catch(err => console.error("Error playing video:", err));
                }
                console.log("Camera access granted and video started.");

                if (frameCaptureInterval) clearInterval(frameCaptureInterval);
                frameCaptureInterval = window.setInterval(captureFrameAndSend, FRAME_CAPTURE_INTERVAL_MS);
            })
            .catch((err) => {
                console.error("Error accessing camera: ", err);
                showDialogWithMessage("Could not access the camera: " + err.message);
            });
    } else {
        console.error("getUserMedia not supported on this browser.");
        showDialogWithMessage("Camera access is not supported by your browser.");
    }
}

function captureFrameAndSend(): void {
    if (!videoStream || !videoElement || !canvasElement || !geminiLiveApi || (geminiLiveApi as any).webSocket?.readyState !== WebSocket.OPEN) {
        return;
    }
    if (videoElement.readyState < videoElement.HAVE_METADATA || videoElement.videoWidth === 0) {
        return;
    }

    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    const context = canvasElement.getContext('2d');
    context?.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    const dataUrl = canvasElement.toDataURL('image/jpeg', 0.8);
    const base64ImageData = dataUrl.split(',')[1];
    if (base64ImageData) geminiLiveApi.sendImageMessage(base64ImageData, 'image/jpeg');
}

const liveAudioInputManager = new LiveAudioInputManager();
// Set the onDisconnected callback
liveAudioInputManager.onDisconnected = (): void => {
    console.log("liveAudioInputManager disconnected");
    geminiLiveApi.disconnect((): void => {
    console.log("Gemini Live API disconnected");
    updateMicIcon("microphone");
    stopVideoInput(); // Stop video input when mic/Gemini disconnects
    clearTranscriptionText();
    });
};

liveAudioInputManager.onNewAudioRecordingChunk = (audioData) => {
    geminiLiveApi.sendAudioMessage(audioData as string); // Assuming audioData is base64 string
};

function startAudioInput(): void {
    liveAudioInputManager.connectMicrophone();
}

function stopAudioInput(): void {
    liveAudioInputManager.disconnectMicrophone();
}

function stopVideoInput(): void {
    if (frameCaptureInterval) {
        clearInterval(frameCaptureInterval);
        frameCaptureInterval = null;
    }
    videoStream?.getTracks().forEach(track => track.stop());
    videoStream = null;
    if (videoElement) videoElement.srcObject = null;
    console.log("Video input stopped.");
}

function disconnectBtnClick(): void {
    setAppStatus("disconnected");
    stopAudioInput();
    stopVideoInput(); // Stop video input when explicitly disconnecting
    geminiLiveApi.disconnect((): void => {
        console.log("Gemini Live API disconnected");
    });
}

function showDialogWithMessage(messageText: string): void {
    const dialog = document.getElementById("dialog") as MdDialogElement | null;
    const dialogMessage = document.getElementById("dialogMessage");
    if (dialogMessage) {
        dialogMessage.innerHTML = messageText;
    }
    dialog?.show();
}

async function getAvailableDevices(deviceType: "videoinput" | "audioinput"): Promise<Device[]> {
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const devices = [];
    allDevices.forEach((device) => {
        if (device.kind === deviceType) {
            devices.push({
                id: device.deviceId,
                name: device.label || device.deviceId,
            });
        }
    });
    return devices;
}

async function getAvailableCameras(): Promise<Device[]> {
    return await getAvailableDevices("videoinput");
}

async function getAvailableAudioInputs(): Promise<Device[]> {
    return await getAvailableDevices("audioinput");
}

function setMaterialSelect(allOptions: Device[], selectElement: HTMLElement | null): void {
    allOptions.forEach((optionData) => {
        const option = document.createElement("md-select-option") as MdSelectOptionElement;
        option.value = optionData.id;

        const slotDiv: HTMLDivElement = document.createElement("div");
        slotDiv.slot = "headline";
        slotDiv.innerHTML = optionData.name;
        option.appendChild(slotDiv);

        selectElement.appendChild(option);
    });
}

async function setAvailableCamerasOptions(): Promise<void> {
    const cameras = await getAvailableCameras();
    const videoSelect = document.getElementById("cameraSource") as MdSelectElement | null;
    if (videoSelect) {
        // setMaterialSelect(cameras, videoSelect);
    }
}

async function setAvailableMicrophoneOptions(): Promise<void> {
    const mics = await getAvailableAudioInputs();
    const audioSelect = document.getElementById("audioSource") as MdSelectElement | null;
    if (audioSelect) {
        // setMaterialSelect(mics, audioSelect);
    }
}

function setAppStatus(status: AppStatus): void {
    if (disconnected) disconnected.hidden = true;
    if (connecting) connecting.hidden = true;
    if (connected) connected.hidden = true;
    if (speaking) speaking.hidden = true;

    switch (status) {
        case "disconnected":
            if (disconnected) disconnected.hidden = false;
            break;
        case "connecting":
            if (connecting) connecting.hidden = false;
            break;
        case "connected":
            connected.hidden = false;
            break;
        case "speaking":
            speaking.hidden = false;
            break;
        default:
    }
}

function initMicButtonClick(): void {
    // const styleCircle = document.getElementById("mic-button");
    let isConnectedToGemini = false; // Track the connection status
    let isMicOpen = false; // Track if the mic is open

    // const styleCircle = micButton; // micButton is already typed as HTMLButtonElement | null

    micButton?.addEventListener("click", () => {
        console.log("Mic Button Clicked!");

        if (!isConnectedToGemini) {
            console.log("Connecting to Gemini Live API...");     
            
            connectBtnClick(); // Connect to Gemini Live API
            
            console.log("Connected to Gemini Live API!");
            // styleCircle.style.backgroundColor = "3396ff";
            isConnectedToGemini = true;
            

            //Open the browser audio
            if(!isMicOpen){
                isMicOpen = true;
                startAudioInput();// Open the browser mic
            }
           
        } else {
            console.log("Disconnecting from Gemini Live API...");

            // stopAudioInput();//stop the mic
            disconnectBtnClick(); // Disconnect from Gemini Live API
            // styleCircle.style.backgroundColor = "white"; // Reset to original color
            isConnectedToGemini = false;
            isMicOpen = false;

            
        }
    });
}

function updateMicIcon(state: MicIconState): void {
    // micIcon is already defined and typed at the top
    if (!micIcon) return;
    if (state === "listening") {
        console.log("Setting icon to fa-waveform");
        micIcon.classList.remove("fa-microphone");
        micIcon.classList.add("fa-wave-square");
        micIcon.style.color = "white";
    } else if (state === "microphone") {
        console.log("Setting icon to fa-microphone");
        micIcon.classList.remove("fa-wave-square");
        micIcon.classList.add("fa-microphone");
        // micIcon.style.color = "#333";
    }
}

function updateTranscriptionText(message: string): void {
    const transcriptionText = document.getElementById('transcription-text') as HTMLDivElement | null;

    if (!transcriptionText){
        return;
    }
    transcriptionText.innerHTML += message + "<br>"; // Modified line
    transcriptionText.scrollTop = transcriptionText.scrollHeight; // Auto-scroll to the bottom
}

function clearTranscriptionText(): void {
   const transcriptionText = document.getElementById('transcription-text') as HTMLDivElement | null;
    if (transcriptionText) {
        transcriptionText.textContent = "";
    }
}