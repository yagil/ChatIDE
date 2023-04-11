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

    document.getElementById('show-code').addEventListener('click', () => {
        vscode.postMessage({ command: 'navigateToHighlightedCode' });
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
        case 'updateHighlightedCodeStatus':
            document.getElementById('highlighted-code-status').textContent = message.status;
            if (message.showButton) {
                document.getElementById('show-code').style.display = 'inline';
                document.getElementById('highlighted-code-status').classList.add('white-text');
            } else {
                document.getElementById('show-code').style.display = 'none';
                document.getElementById('highlighted-code-status').classList.remove('white-text');
            }
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

        const codeBlocks = messageElement.querySelectorAll('pre code');
        codeBlocks.forEach((codeBlock) => {
            const preElement = codeBlock.parentNode;
            if (preElement.tagName === 'PRE') {
                const wrapper = document.createElement('div');
                wrapper.className = 'code-block-wrapper';
                preElement.parentNode.insertBefore(wrapper, preElement);
                if (role === 'assistant') {
                    const button = createCopyCodeButton(codeBlock);
                    wrapper.appendChild(button);
                }
                wrapper.appendChild(preElement);
            }
        });
        highlightCodeBlocks(messageElement);
        
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

function highlightCodeBlocks(element) {
    const codeBlocks = element.querySelectorAll('pre code');
    codeBlocks.forEach((codeBlock) => {
        hljs.highlightBlock(codeBlock);
    });
}

function createCopyCodeButton(codeBlock) {
    const button = document.createElement('button');
    button.textContent = 'Copy code';
    button.className = 'copy-code-button';
    button.addEventListener('click', () => {
        navigator.clipboard.writeText(codeBlock.textContent).then(() => {
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.textContent = 'Copy code';
            }, 2000);
        });
    });
    return button;
}
  