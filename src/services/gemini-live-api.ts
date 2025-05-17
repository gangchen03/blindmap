interface ServerMessageDataPart {
    text?: string;
    inlineData?: {
        data: string;
    };
}

interface ServerMessageDataModelTurn {
    parts: ServerMessageDataPart[];
}

interface ServerMessageDataServerContent {
    turnComplete?: boolean;
    modelTurn?: ServerMessageDataModelTurn;
}

interface ServerMessageData {
    serverContent?: ServerMessageDataServerContent;
    setupComplete?: boolean;
}

export type ResponseModality = "TEXT" | "AUDIO";

export class GeminiLiveResponseMessage {
    public data: string = "";
    public type: "SETUP COMPLETE" | ResponseModality | "" = "";
    public endOfTurn: boolean | undefined;

    constructor(messageData?: ServerMessageData) {
        this.endOfTurn = messageData?.serverContent?.turnComplete;

        const parts = messageData?.serverContent?.modelTurn?.parts;

        if (messageData?.setupComplete) {
            this.type = "SETUP COMPLETE";
        } else if (parts?.length && parts[0].text) {
            this.data = parts[0].text;
            this.type = "TEXT";
        } else if (parts?.length && parts[0].inlineData) {
            this.data = parts[0].inlineData.data;
            this.type = "AUDIO";
        }
    }
}

interface ServiceSetupMessage {
    bearer_token: string | undefined;
    service_url: string;
}

interface SessionSetupMessagePart {
    text: string;
}

interface SessionSetupMessage {
    setup: {
        model: string;
        generation_config: {
            response_modalities: ResponseModality[];
        };
        system_instruction: {
            parts: SessionSetupMessagePart[];
        };
    };
}

interface ClientContentPart {
    text: string;
}

interface ClientContentTurn {
    role: "user";
    parts: ClientContentPart[];
}

interface ClientTextMessage {
    client_content: {
        turns: ClientContentTurn[];
        turn_complete: boolean;
    };
}

interface RealtimeInputMediaChunk {
    mime_type: string;
    data: string;
}

interface RealtimeInputMessage {
    realtime_input: {
        media_chunks: RealtimeInputMediaChunk[];
    };
}

export class GeminiLiveAPI {
    public proxyUrl: string;
    public projectId: string;
    public model: string;
    public modelUri: string;
    public responseModalities: ResponseModality[];
    public systemInstructions: string;
    public apiHost: string;
    public serviceUrl: string;

    public onReceiveResponse: (message: GeminiLiveResponseMessage) => void;
    public onConnectionStarted: () => void;
    public onErrorMessage: (message: string) => void;
    public onDisconnected: () => void; // Callback for when the websocket is disconnected

    private accessToken: string | undefined;
    private webSocket: WebSocket | null;
    private isDisconnecting: boolean; // Flag to track if we are disconnecting
    private isSessionSetupComplete: boolean; // Flag to track if session setup with server is complete

    constructor(proxyUrl: string, projectId: string, model: string, apiHost: string) {
        this.proxyUrl = proxyUrl;
        this.projectId = projectId;
        this.model = model;
        this.modelUri = `projects/${this.projectId}/locations/us-central1/publishers/google/models/${this.model}`;
        this.responseModalities = ["TEXT"];
        this.systemInstructions = "";
        this.apiHost = apiHost;
        this.serviceUrl = `wss://${this.apiHost}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;

        this.onReceiveResponse = (message: GeminiLiveResponseMessage) => {
            console.log("Default message received callback", message);
        };
        this.onConnectionStarted = () => {
            console.log("Default onConnectionStarted");
        };
        this.onErrorMessage = (message: string) => {
            alert(message); // Consider replacing alert with a more modern notification system
        };
        this.onDisconnected = () => {
            console.log("Default onDisconnected callback triggered");
        };

        this.accessToken = undefined;
        this.webSocket = null;
        this.isDisconnecting = false;
        this.isSessionSetupComplete = false;

        console.log("Created Gemini Live API object: ", this);
    }

    public setProjectId(projectId: string): void {
        this.projectId = projectId;
        this.modelUri = `projects/${this.projectId}/locations/us-central1/publishers/google/models/${this.model}`;
    }

    public setAccessToken(newAccessToken: string | undefined): void {
        console.log("setting access token: ", newAccessToken);
        this.accessToken = newAccessToken;
    }

    public connect(accessToken?: string): void {
        if (accessToken !== undefined) {
            this.setAccessToken(accessToken);
        }
        this.isSessionSetupComplete = false; // Reset on new connection attempt
        this.setupWebSocketToService();
    }

    public disconnect(onDisconnectedCallback?: () => void): void {
        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
            this.isDisconnecting = true;
            this.webSocket.onclose = (event) => {
                console.log("websocket closed: ", event);
                // this.onErrorMessage("Connection closed"); // This might be redundant if the general onclose also calls it
                this.webSocket = null;
                this.isDisconnecting = false;
                if (onDisconnectedCallback) {
                    onDisconnectedCallback();
                }
                this.isSessionSetupComplete = false;
                this.onDisconnected(); // Call the instance's onDisconnected callback
            };
            this.webSocket.close();
        } else {
            this.webSocket = null;
            if (onDisconnectedCallback) {
                onDisconnectedCallback();
            }
            this.isSessionSetupComplete = false;
            this.onDisconnected(); // Call the instance's onDisconnected callback
        }
    }

    private sendMessage(message: ServiceSetupMessage | SessionSetupMessage | ClientTextMessage | RealtimeInputMessage): void {
        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
            this.webSocket.send(JSON.stringify(message));
        } else {
            console.warn("WebSocket is not open. Cannot send message:", message);
        }
    }

    private onReceiveMessage(messageEvent: MessageEvent): void {
        console.log("Message received: ", messageEvent);
        try {
            const messageData = JSON.parse(messageEvent.data) as ServerMessageData;
            const parsedMessage = new GeminiLiveResponseMessage(messageData);

            if (parsedMessage.type === "SETUP COMPLETE") {
                console.log("Gemini Live API: Session setup complete message received.");
                this.isSessionSetupComplete = true;
                // Ensure socket is still open before calling onConnectionStarted
                if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
                    this.onConnectionStarted(); // Now signal that the connection and setup are truly ready
                }
            } else if (this.isSessionSetupComplete) {
                // Only process other types of messages if session setup is complete
                this.onReceiveResponse(parsedMessage);
            } else {
                console.warn("Gemini Live API: Received message before session setup was complete. Type:", parsedMessage.type, "Raw Data:", messageData);
            }
        } catch (error) {
            console.error("Error parsing received message:", error, messageEvent.data);
            this.onErrorMessage("Error processing message from server.");
        }
    }

    private setupWebSocketToService(): void {
        if (this.webSocket && this.webSocket.readyState !== WebSocket.CLOSED) {
            console.warn("WebSocket connection already exists or is in progress.");
            return;
        }
        console.log("connecting: ", this.proxyUrl);
        this.isSessionSetupComplete = false; // Reset on new WebSocket setup
        this.webSocket = new WebSocket(this.proxyUrl);
        console.log("web socket connection initiated");

        this.webSocket.onclose = (event) => {
            console.log("websocket closed: ", event);
            if (!this.isDisconnecting) { // Only show error if not an intentional disconnect
                this.onErrorMessage("Connection closed unexpectedly");
            }
            this.webSocket = null; // Ensure it's nulled out
            this.onDisconnected(); // Call the instance's onDisconnected callback
        };

        this.webSocket.onerror = (event) => {
            console.error("websocket error: ", event);
            this.onErrorMessage("Connection error");
            this.webSocket = null; // Ensure it's nulled out on error too
            this.onDisconnected(); // Call the instance's onDisconnected callback
        };

        this.webSocket.onopen = (event) => {
            console.log("websocket open: ", event);
            this.sendInitialSetupMessages();
            // this.onConnectionStarted(); // Moved: Will be called after "SETUP COMPLETE" message
        };

        this.webSocket.onmessage = this.onReceiveMessage.bind(this);
    }

    private sendInitialSetupMessages(): void {
        if (!this.accessToken) {
            console.warn("Access token is not set. Sending initial setup messages without bearer token.");
            // this.onErrorMessage("Access token is required to connect."); // Or handle this more gracefully
            // return;
        }
        const serviceSetupMessage: ServiceSetupMessage = {
            bearer_token: this.accessToken,
            service_url: this.serviceUrl,
        };
        this.sendMessage(serviceSetupMessage);

        const sessionSetupMessage: SessionSetupMessage = {
            setup: {
                model: this.modelUri,
                generation_config: {
                    response_modalities: this.responseModalities,
                },
                system_instruction: {
                    parts: [{ text: this.systemInstructions }],
                },
            },
        };
        this.sendMessage(sessionSetupMessage);
    }

    public sendTextMessage(text: string): void {
        const textMessage: ClientTextMessage = {
            client_content: {
                turns: [
                    {
                        role: "user",
                        parts: [{ text: text }],
                    },
                ],
                turn_complete: true,
            },
        };
        this.sendMessage(textMessage);
    }

    private sendRealtimeInputMessage(data: string, mime_type: string): void {
        const message: RealtimeInputMessage = {
            realtime_input: {
                media_chunks: [
                    {
                        mime_type: mime_type,
                        data: data,
                    },
                ],
            },
        };
        this.sendMessage(message);
    }

    public sendAudioMessage(base64PCM: string): void {
        this.sendRealtimeInputMessage(base64PCM, "audio/pcm");
    }

    public sendImageMessage(base64Image: string, mime_type: string = "image/jpeg"): void {
        this.sendRealtimeInputMessage(base64Image, mime_type);
    }
}

console.log("loaded gemini-live-api.ts");