const vscode = acquireVsCodeApi();

let gPreferences = {};

document.addEventListener("DOMContentLoaded", () => {
    const messagesContainer = document.getElementById("messages");

    document.getElementById("send-button").addEventListener("click", sendMessage);

    // listen for enter and enter + shift:
    document.getElementById("message-input").addEventListener("keydown", (e) => {
        // if "pressEnterToSend" is in gPreferences, get it:
        const pressEnterToSend = gPreferences.pressEnterToSend ?? false;

        if (pressEnterToSend && e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    const messageInputTextArea = document.getElementById('message-input');
    handleTabInTextarea(messageInputTextArea);

    messageInputTextArea.addEventListener('input', function () {
        autoResize(this);
    });

    document.getElementById('reset-button').addEventListener('click', () => {
        vscode.postMessage({
            command: 'resetChat'
        });
    });

    document.getElementById('auto-save-checkbox').addEventListener('change', (event) => {
        vscode.postMessage({
            command: 'toggleAutoSave',
            enabled: event.target.checked
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

    document.getElementById('config-container').addEventListener('click', () => {
        vscode.postMessage({
            command: 'openSettings'
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
        case "updateHighlightedCodeStatus":
            document.getElementById('highlighted-code-status').textContent = message.status;
            if (message.showButton) {
                document.getElementById('show-code').style.display = 'inline';
                document.getElementById('highlighted-code-status').classList.add('white-text');
            } else {
                document.getElementById('show-code').style.display = 'none';
                document.getElementById('highlighted-code-status').classList.remove('white-text');
            }
            break;
        case "updateModelConfigDetails":
            document.getElementById('model-name').textContent = message.modelConfigDetails;
            break;
        case "updatePreferences":
            gPreferences = message.preferences;
            if (gPreferences.pressEnterToSend) {
                document.getElementById('send-button').textContent = "⏎ to Send";
                document.getElementById('send-button').style.fontSize = '0.8em';
            } else {
                console.log('unhiding send-button');
                document.getElementById('send-button').style.fontSize = '1.1em';
                document.getElementById('send-button').textContent = "Send";
            }
            break;
        default:
            throw new Error(`Unknown command: ${message.command}`);
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
    const COPY_BUTTON_TEXT = 'Copy code';
    const button = document.createElement('button');

    button.textContent = COPY_BUTTON_TEXT;
    button.className = 'copy-code-button';
    button.addEventListener('click', () => {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(codeBlock);
        selection.removeAllRanges();
        selection.addRange(range);

        try {
            // Some users on Linux reported that `navigator.clipboard.writeText` failed
            // Reluctantly using `document.execCommand('copy')` as a fallback
            document.execCommand('copy');
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.textContent = COPY_BUTTON_TEXT;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }

        selection.removeAllRanges();
    });
    return button;
}


function wrapCodeBlocks(messageElement, role) {
    const codeBlocks = messageElement.querySelectorAll('pre code');
    codeBlocks.forEach((codeBlock) => {
        const preElement = codeBlock.parentNode;
        if (preElement.tagName === 'PRE') {
            const wrapper = createCodeBlockWrapper(codeBlock, role);
            preElement.parentNode.insertBefore(wrapper, preElement);
            wrapper.appendChild(preElement);
        }
    });
}

function createCodeBlockWrapper(codeBlock, role) {
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    if (role === 'assistant') {
        // Future: enable drag n drop for code blocks
        // Must be configurable behavior (e.g. in settings)
        wrapper.draggable = false;
        wrapper.addEventListener('dragstart', (event) => {
            event.dataTransfer.setData('text/plain', codeBlock.textContent);
        });
        const button = createCopyCodeButton(codeBlock);
        wrapper.appendChild(button);
    }
    return wrapper;
}
