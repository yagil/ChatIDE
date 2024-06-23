const vscode = acquireVsCodeApi();

let gPreferences = {};
let fileTree = {};
let selectedFiles = [];

document.addEventListener("DOMContentLoaded", () => {
    const messagesContainer = document.getElementById("messages");

    document.getElementById("send-button").addEventListener("click", sendMessage);
    document.getElementById("message-input").addEventListener("keydown", handleInputKeydown);
    document.getElementById("reset-button").addEventListener("click", resetChat);
    document.getElementById("export-button").addEventListener("click", exportChat);
    document.getElementById("import-button").addEventListener("click", importChat);
    document.getElementById("config-container").addEventListener("click", openSettings);
    document.getElementById("show-code").addEventListener("click", navigateToHighlightedCode);
    document.getElementById("auto-save-checkbox").addEventListener("change", toggleAutoSave);
    document.getElementById("toggle-file-tree-button").addEventListener("click", toggleFileTree);

    const messageInputTextArea = document.getElementById('message-input');
    handleTabInTextarea(messageInputTextArea);
    messageInputTextArea.addEventListener('input', function () {
        autoResize(this);
    });

    window.addEventListener("message", handleVSCodeMessage);
});

function handleInputKeydown(e) {
    const pressEnterToSend = gPreferences.pressEnterToSend ?? false;

    if (pressEnterToSend && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function handleVSCodeMessage(event) {
    const message = event.data;
    switch (message.command) {
    case "sentUserMessage":
        addMessage("user", message.userMessageMarkdown);
        break;
    case "gptResponse":
        addMessage("assistant", message.token, true);
        break;
    case "resetChatComplete":
        document.getElementById("messages").innerHTML = "";
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
        updateHighlightedCodeStatus(message);
        break;
    case "updateModelConfigDetails":
        document.getElementById('model-name').textContent = message.modelConfigDetails;
        break;
    case "updatePreferences":
        updatePreferences(message.preferences);
        break;
    case "updateFileTree":
        fileTree = message.fileTree;
        renderFileTree();
        break;
    case "toggleFileTree":
        toggleFileTree();
        break;
    default:
        console.error(`Unknown command: ${message.command}`);
    }
}

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

    const messagesContainer = document.getElementById("messages");
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

    vscode.postMessage({
        command: "getGptResponse",
        userMessage: escapeHtml(userMessage),
    });
}

function resetChat() {
    vscode.postMessage({
        command: 'resetChat'
    });
}

function exportChat() {
    vscode.postMessage({
        command: 'exportChat'
    });
}

function importChat() {
    vscode.postMessage({
        command: 'importChat'
    });
}

function openSettings() {
    vscode.postMessage({
        command: 'openSettings'
    });
}

function navigateToHighlightedCode() {
    vscode.postMessage({ command: 'navigateToHighlightedCode' });
}

function toggleAutoSave(event) {
    vscode.postMessage({
        command: 'toggleAutoSave',
        enabled: event.target.checked
    });
}

function updatePreferences(preferences) {
    gPreferences = preferences;
    if (gPreferences.pressEnterToSend) {
        document.getElementById('send-button').textContent = "⏎ to Send";
        document.getElementById('send-button').style.fontSize = '0.8em';
    } else {
        document.getElementById('send-button').style.fontSize = '1.1em';
        document.getElementById('send-button').textContent = "Send";
    }
}

function updateHighlightedCodeStatus(message) {
    document.getElementById('highlighted-code-status').textContent = message.status;
    if (message.showButton) {
        document.getElementById('show-code').style.display = 'inline';
        document.getElementById('highlighted-code-status').classList.add('white-text');
    } else {
        document.getElementById('show-code').style.display = 'none';
        document.getElementById('highlighted-code-status').classList.remove('white-text');
    }
}

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

function toggleFileTree() {
    const fileTreeContainer = document.getElementById('file-tree-container');
    fileTreeContainer.classList.toggle('hidden');
}

function renderFileTree() {
    const fileTreeElement = document.getElementById('file-tree');
    fileTreeElement.innerHTML = '';
    fileTreeElement.appendChild(createFileTreeNode(fileTree, ''));
}

function createFileTreeNode(node, path) {
    const ul = document.createElement('ul');
    
    for (const [name, value] of Object.entries(node)) {
        const li = document.createElement('li');
        const fullPath = path ? `${path}/${name}` : name;
        
        if (value === null) {
            // File
            li.innerHTML = `<input type="checkbox" id="${fullPath}" ${selectedFiles.includes(fullPath) ? 'checked' : ''}> <span class="file">${name}</span>`;
            li.querySelector('input').addEventListener('change', (e) => handleFileSelection(e, fullPath));
        } else {
            // Folder
            li.innerHTML = `<span class="folder">${name}</span>`;
            li.appendChild(createFileTreeNode(value, fullPath));
        }
        
        ul.appendChild(li);
    }
    
    return ul;
}

function handleFileSelection(event, filePath) {
    if (event.target.checked) {
        selectedFiles.push(filePath);
    } else {
        const index = selectedFiles.indexOf(filePath);
        if (index > -1) {
            selectedFiles.splice(index, 1);
        }
    }
    vscode.postMessage({
        command: 'updateSelectedFiles',
        selectedFiles: selectedFiles
    });
}