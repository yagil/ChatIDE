const vscode = acquireVsCodeApi();

document.addEventListener("DOMContentLoaded", () => {
    const messagesContainer = document.getElementById("messages");
  
    document.getElementById("send-button").addEventListener("click", sendMessage);

    const messageInputTextArea = document.getElementById('message-input');
    handleTabInTextarea(messageInputTextArea);
    
    messageInputTextArea.addEventListener('input', function() {
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
        case "sentUserMessage":
            addMessage("user", message.userMessageMarkdown);
            break;
        case "gptResponse":
            addMessage("assistant", message.token, true);
            break;
        case "resetChatComplete":
            messagesContainer.innerHTML = "";
            break;
        case "loadChatComplete":
            message.messages.forEach((message) => {
                addMessage(message.role, message.content);
            });
            break;
        case "openAiError":
            addMessage("extension", message.error);
            break;
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
        case "extension":
            className = "extension-message";
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

        messageElement.innerHTML = content;

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
      
        vscode.postMessage(
            {
                command: "getGptResponse",
                userMessage: escapeHtml(userMessage),
            }
        );
    }
});

function escapeHtml(html) {
    let inCodeBlock = false;
    let escapedHtml = '';
    const codeBlockRegex = /(```|`)/g;
    const htmlEntities = [
        { regex: /&/g, replacement: '&amp;' },
        { regex: /</g, replacement: '&lt;' },
        { regex: />/g, replacement: '&gt;' },
        { regex: /"/g, replacement: '&quot;' },
        { regex: /'/g, replacement: '&#039;' },
    ];
  
    html.split(codeBlockRegex).forEach((segment, index) => {
        // If the index is even, it's not a code block.
        // If the index is odd, it's a code block.
        if (index % 2 === 0) {
            if (!inCodeBlock) {
                htmlEntities.forEach(({ regex, replacement }) => {
                    segment = segment.replace(regex, replacement);
                });
            }
        } else {
            inCodeBlock = !inCodeBlock;
        }
        escapedHtml += segment;
    });
  
    return escapedHtml;
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function handleTabInTextarea(textarea) {
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.value = textarea.value.substring(0, start) + '\t' + textarea.value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + 1;
        }
    });
}
  