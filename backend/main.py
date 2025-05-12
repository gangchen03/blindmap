import asyncio
import json
import datetime
import logging
import os

import websockets
from websockets.legacy.protocol import WebSocketCommonProtocol
from websockets.legacy.server import WebSocketServerProtocol
import google.auth
import google.auth.transport.requests

# for cloud run only
"""
import google.cloud.logging
# Instantiates a client
client = google.cloud.logging.Client()

# Retrieves a Cloud Logging handler based on the environment
# you're running in and integrates the handler with the
# Python logging module. By default this captures all logs
# at INFO level and higher
client.setup_logging()
"""

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)


HOST = "us-central1-aiplatform.googleapis.com"
SERVICE_URL = f"wss://{HOST}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"

DEBUG = False  # Enable detailed debug messages

cached_auth_token = None
auth_token_expiration = None

def get_access_token():
    global cached_auth_token, auth_token_expiration
    logging.info("get_access_token called")  # Debug message
    # use cached token
    if cached_auth_token and auth_token_expiration > datetime.datetime.now():
        logging.info("Using cached auth token")  # Debug message
        return cached_auth_token

    # fresh token
    logging.info("Refreshing auth token")  # Debug message
    try:
        credentials, _ = google.auth.default()
        auth_request = google.auth.transport.requests.Request()
        credentials.refresh(auth_request)

        cached_auth_token = credentials.token
        auth_token_expiration = datetime.datetime.now() + datetime.timedelta(minutes=50)
        logging.info("Auth token refreshed successfully")  # Debug message
        return cached_auth_token
    except Exception as e:
        logging.error(f"Error refreshing auth token: {e}")  # Debug message
        return None


async def proxy_task(
    client_websocket: WebSocketCommonProtocol, server_websocket: WebSocketCommonProtocol
) -> None:
    """
    Forwards messages from one WebSocket connection to another.

    Args:
        client_websocket: The WebSocket connection from which to receive messages.
        server_websocket: The WebSocket connection to which to send messages.
    """
    try:
        async for message in client_websocket:
            try:
                data = json.loads(message)
                if DEBUG:
                    logging.info(f"proxying: {data}")
                await server_websocket.send(json.dumps(data))
            except Exception as e:
                logging.error(f"Error processing message: {e}")
    except Exception as e:
        logging.error(f"Error in proxy_task: {e}")
    finally:
        await server_websocket.close()


async def create_proxy(client_websocket: WebSocketCommonProtocol) -> None:
    """
    Establishes a WebSocket connection to the server and creates two tasks for
    bidirectional message forwarding between the client and the server.

    Args:
        client_websocket: The WebSocket connection of the client.
    """
    logging.info("create_proxy called")  # Debug message
    bearer_token = get_access_token()
    if bearer_token is None:
        logging.error("Failed to get bearer token. Cannot create proxy.")
        await client_websocket.close(code=1011, reason="Failed to get bearer token")
        return

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {bearer_token}",
    }
    logging.info(f"Connecting to {SERVICE_URL}")  # Debug message
    try:
        async with websockets.connect(
            SERVICE_URL, additional_headers=headers
        ) as server_websocket:
            logging.info("Connected to Gemini API")  # Debug message
            client_to_server_task = asyncio.create_task(
                proxy_task(client_websocket, server_websocket)
            )
            server_to_client_task = asyncio.create_task(
                proxy_task(server_websocket, client_websocket)
            )
            await asyncio.gather(client_to_server_task, server_to_client_task)
    except Exception as e:
        logging.error(f"Error in create_proxy: {e}")  # Debug message


async def handle_client(client_websocket: WebSocketServerProtocol) -> None:
    """
    Handles a new client connection,
    Establishes a proxy connection to the server upon successful authentication.

    Args:
        client_websocket: The WebSocket connection of the client.
    """
    logging.info("New client connection")  # Debug message
    try:
        # Wait for the first message from the client
        auth_message = await asyncio.wait_for(client_websocket.recv(), timeout=5.0)
        auth_data = json.loads(auth_message)
        logging.info(f"Received message from client: {auth_data}")
        await create_proxy(client_websocket)
    except asyncio.TimeoutError:
        logging.error("Timeout waiting for client message.")
        await client_websocket.close(code=1008, reason="Timeout waiting for client message")
    except Exception as e:
        logging.error(f"Error handling client connection: {e}")
        await client_websocket.close(code=1011, reason="Internal server error")


async def main() -> None:
    """
    Starts the WebSocket server and listens for incoming client connections.
    """
    logging.info("Starting WebSocket server")  # Debug message
    async with websockets.serve(handle_client, "localhost", 8080):
        logging.info("WebSocket server started on localhost:8080")  # Debug message
        # Run forever
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
