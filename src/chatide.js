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

    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.command) {
        case "gptResponse":
            addMessage("assistant", message.token, true);
            break;
        case "resetChatComplete":
            messagesContainer.innerHTML = "";
            break;
        }
    });

    function addMessage(role, content, streaming = false) {
        let messageElement;
    
        if (streaming) {
            messageElement = document.querySelector(`.${role}-message:last-child`);
            if (!messageElement) {
                messageElement = document.createElement("div");
                messageElement.className = role === "user" ? "user-message" : "assistant-message";
                messagesContainer.insertAdjacentElement("beforeend", messageElement);
            }

            messageElement.innerHTML = content;
        } else {
            messageElement = document.createElement("div");
            messageElement.className = role === "user" ? "user-message" : "assistant-message";
        
            messagesContainer.insertAdjacentElement("beforeend", messageElement);

            messageElement.textContent = content;
        }
    
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