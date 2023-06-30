# Change Log

All notable changes to the "ChatIDE" extension will be documented in this file.

## [0.2.8]
### Bug fix
- Changing OpenAI API key would sometimes not work

## [0.2.7]

### Added
- New setting that enables sending messages using Enter key press (enable in settings)
- Support for custom server URL (must be OpenAI 'compatible')

## [0.2.6]

### Added
- Support for Claude 100K context length ("claude-v1.3-100k")
- Support for GPT4 32K context length ("gpt-4-32k")

## [0.2.0]

### Added
- Support for Anthropic's Claude

## [0.1.0]

### Added
- Use highlight.js to highlight code blocks
- "copy code" button to easily copy code produced by the assistant
- Highlighting code automatically includes it in a special "context" prefix message to the assistant (this happens only once per code selection)
- Pressing tab in the textrea now inserts a tab into the text instead of changing focus target

## [0.0.9]

### Added
- Render the user message as markdown

## [0.0.8]

### Changed
- Change default model to gpt-3.5-turbo because most people don't have access to 4 yet

### Added
- Show OpenAI API error in the chat with some troubleshooting options

## [0.0.7]

### Added
- Load and continue a conversation from JSON file
- Styling updates

## [0.0.6]

### Fixed
- Fix a bug where the api key won't be registered until the user restarted VS Code

## [0.0.5]

### Added
- Add code to publish the extension to Microsoft's extension marketplace

## [0.0.4]

### Added
- Store API key in VS Code secretStorage
- System prompt asks GPT to avoid repeating information

## [0.0.3]

### Added
- Ability to configure system prompt through extension settings
- Ability to reset chat
- Ability to export current chat as JSON

## [Unreleased]

- Initial release