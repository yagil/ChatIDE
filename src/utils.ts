import * as vscode from 'vscode';

const supportedProviders = ["openai", "anthropic"];

export function getProviderErrorMsg(provider: string, error: any) {
    const model = vscode.workspace.getConfiguration('chatide').get('model') || "No model configured";
    const epilogue = `
        \t • <b>Invalid API Key</b>: make sure you entered it correctly (Need help? See <a href="https://github.com/yagil/ChatIDE#configuration">Setting your AI provider API key</a>).<br>
        \t • <b>Invalid Model name</b>: make sure you chose a supported model. Your current model is <b>${model.toString()}</b><br>
        \t • <b>Model not compatible with your API Key</b>: your key might not grant you access to this model.<br>
        \t • <b>Chat history too long</b>: models have a limited context window. Export your current history to file and start a new chat.<br><br>
        Double check your configuration and restart VS Code to try again.<br><br>    
        If the issue persists, please <a href="https://github.com/yagil/chatIDE/issues">open an issue on GitHub</a> or contact us on <a href="https://twitter.com/aichatide">Twitter</a>.
    `;

    if (provider === "openai") {
        return `
            <b>You're hitting an OpenAI API error.</b><br><br>
            <b>Error message</b>: <i>'${error}'</i>.<br><br>
            <u>Common reasons for OpenAI errors</u>:<br><br>
            \t • <b>OpenAI might be having issues</b>: check the <a href="https://status.openai.com/">OpenAI system status page</a>.<br>
            \t • <b>Exceeded quota</b>: make sure your OpenAI billing is setup correctly.<br>
            ${epilogue}
        `;
    } else if (provider === "anthropic") {
        return `
            <b>You're hitting an Anthropic API error.</b><br><br>
            <b>Error message</b>: <i>'${error}'</i>.<br><br>
            <u>Common reasons for Anthropic errors</u>:<br><br>
            \t • <b>Anthropic might be having issues</b>: check <a href="https://twitter.com/AnthropicAI">Anthropic's twitter page</a>.<br>
            \t • <b>Exceeded quota</b>: make sure your Anthropic billing is setup correctly.<br>
            ${epilogue}
        `; 
    }

    return `Error: ${error}`;
} 

export async function promptForApiKey(provider: string, context: vscode.ExtensionContext) {
    if (!supportedProviders.includes(provider)) {
        vscode.window.showErrorMessage(`Invalid provider "${provider}" in the ChatIDE settings. Please use a valid provider and restart the extension.`);
        return;
    }

    let providerCleanName = provider.charAt(0).toUpperCase() + provider.slice(1);
    
    const apiKey = await vscode.window.showInputBox({
        prompt: `Enter your ${providerCleanName} API key to use ChatIDE. Your API key will be stored in VS Code\'s SecretStorage.`,
        ignoreFocusOut: true,
        password: true,
    });

    const secretStorageKey = `chatide.${provider}ApiKey`;

    if (apiKey) {
        await context.secrets.store(secretStorageKey, apiKey);
        vscode.window.showInformationMessage(`API key stored successfully (under '${secretStorageKey}').`);
    } else {
        vscode.window.showErrorMessage('No API key entered. Please enter your API key to use ChatIDE.');
    }
}

export function providerFromModel(model: string) {
    if (model.startsWith("gpt")) {
        return "openai";
    }
    if (model === "custom") {
        return "custom";
    }
    return "anthropic";
}