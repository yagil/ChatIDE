const vscode = acquireVsCodeApi();

document.addEventListener("DOMContentLoaded", () => {
    const messagesContainer = document.getElementById("messages");
  
    document.getElementById("send-button").addEventListener("click", sendMessage);

    document.getElementById('message-input').addEventListener('input', function() {
        autoResize(this);
    });

    document.getElementById('reset-button').addEventListener('click', () => {
        vscode.postMessage({
            command: 'resetChat'
        });
    });

    document.getElementById('export-button').addEventListener('click', () => {
        vscode.postMessage({
            command: 'exportChat'
        });
    });

    document.getElementById('import-button').addEventListener('click', () => {
        vscode.postMessage({
            command: 'importChat'
        });
    });

    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.command) {
        case "gptResponse":
            addMessage("assistant", message.token, true);
            break;
        case "resetChatComplete":
            messagesContainer.innerHTML = "";
            break;
        case "loadChatComplete":
            message.messages.forEach((message) => {
                addMessage(message.role, message.content);
            }
            );
        }
    });

    function addMessage(role, content, streaming = false) {
        let className;
        switch (role) {
        case "user":
            className = "user-message";
            break;
        case "assistant":
            className = "assistant-message";
            break;
        case "system":
            className = "system-message";
            break;
        default:
            throw new Error(`Unknown role: ${role}`);
        }

        let messageElement;

        if (streaming) {
            messageElement = document.querySelector(`.${role}-message:last-child`);
            if (!messageElement) {
                messageElement = document.createElement("div");
                messageElement.className = className;
            }
        } else {
            messageElement = document.createElement("div");
            messageElement.className = className;
        }

        if (role === "user") {
            // The user's message is plain text.
            messageElement.textContent = content;
        } else {
            // The assistant's message is HTML (Markdown).
            messageElement.innerHTML = content;
        }

        messagesContainer.insertAdjacentElement("beforeend", messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    function sendMessage() {
        const input = document.getElementById("message-input");
        const userMessage = input.value;
        input.value = "";
        autoResize(input);
      
        if (!userMessage) {
            return;
        }
      
        addMessage("user", userMessage, false);

        vscode.postMessage(
            {
                command: "getGptResponse",
                userMessage,
            }
        );
    }
});

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}