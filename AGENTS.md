# Rust/codex-rs

In the codex-rs folder where the rust code lives:

- Never add or modify any code related to `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR`. You operate in a sandbox where `CODEX_SANDBOX_NETWORK_DISABLED=1` will be set whenever you use the `shell` tool. Any existing code that uses `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` was authored with this fact in mind. It is often used to early exit out of tests that the author knew you would not be able to run given your sandbox limitations.

# Product Requirements Document: DATA Codex - Cyberpunk AI Swarm System

## 1. Introduction

**DATA Codex** is an advanced, AI-powered command-line interface (CLI) designed to transform the software development lifecycle. It evolves the traditional single-agent coding assistant into a sophisticated **multi-agent swarm system**. This system enables multiple AI models from various providers to collaborate in parallel on complex coding tasks, managed through an intuitive, cyberpunk-themed terminal interface with optional mobile integration. DATA Codex aims to automate and accelerate development, from initial codebase analysis and task planning to code generation, testing, and version control, all while providing transparency and control to the developer.

## 2. Goals

*   **Accelerate Development**: Significantly reduce the time and effort required for coding, debugging, and project management tasks by leveraging a swarm of AI agents.
*   **Enhance Developer Productivity**: Allow developers to offload complex or repetitive tasks to AI agents, focusing on high-level architecture and problem-solving.
*   **Improve Code Quality**: Utilize specialized AI agents for code review, test generation, and adherence to best practices.
*   **Provide Seamless Automation**: Enable "fire-and-forget" workflows where the AI swarm can autonomously analyze a codebase, identify tasks, and execute them with minimal human intervention.
*   **Offer Transparency and Control**: Give users clear visibility into the AI swarm's activities through comprehensive logging and a real-time dashboard, with intuitive controls to manage the system.
*   **Foster Multi-Provider AI Collaboration**: Create a platform where the best AI models from different providers (OpenAI, Anthropic, Google) can work together, leveraging their unique strengths.
*   **Deliver an Engaging User Experience**: Provide a futuristic, cyberpunk-themed interface that is both powerful and enjoyable to use.

## 3. Target Users

*   **Software Developers (All Levels)**: From junior to senior engineers looking to augment their coding capabilities, automate tasks, and improve efficiency.
*   **DevOps Engineers**: For automating infrastructure tasks, script generation, and deployment processes.
*   **Project Managers/Team Leads**: For high-level task planning, progress tracking, and codebase analysis.
*   **AI Enthusiasts & Researchers**: Exploring advanced multi-agent systems and AI collaboration.

## 4. User Stories / Use Cases

*   **As a developer, I want to type `data` in my project directory so that the AI swarm can automatically analyze my codebase, identify pending tasks or goals, and start working on them autonomously.**
*   **As a developer, I want to give a high-level prompt like `data "refactor the user authentication module"` so that multiple AI agents can collaborate on planning, coding, testing, and committing the changes.**
*   **As a developer, I want to see a real-time dashboard of all active AI agents, their current tasks, progress, and any issues, so I can understand what the swarm is doing.**
*   **As a developer, I want to be able to type commands or feedback at any time, even while agents are working, so that my input can be immediately incorporated into the swarm's coordination.**
*   **As a developer, I want the AI swarm to automatically manage git branches for different tasks and agents, and handle merges, so I don't have to worry about version control conflicts.**
*   **As a developer, I want a detailed log of all AI agent inputs, outputs, decisions, and coordination steps, so I can review the process, debug issues, and understand how tasks were completed.**
*   **As a developer, I want to use a mobile app to monitor the swarm's progress, receive notifications, and potentially issue commands when I'm away from my terminal.**
*   **As a developer, I want to easily toggle network access for the AI agents, so I can control their ability to access external resources for security or cost reasons.**
*   **As a developer, when using the regular single-agent mode, I want a simplified approval process with an option to quickly switch to full auto-approval or activate the swarm.**

## 5. Product Features

### 5.1. Core Interaction Modes

1.  **Autonomous Swarm Mode (`data` command with no arguments)**:
    *   Activates a cyberpunk-themed startup sequence visualizing codebase analysis, goal identification, task prioritization, and agent deployment.
    *   AI swarm intelligently analyzes the current project (README, `goals.md`, `LLM_LOGS/`, git history, TODOs) to create a prioritized task list.
    *   Swarm autonomously begins working on identified tasks.
    *   Full auto-approval is enabled by default; the swarm operates without requiring per-command confirmation.
2.  **Standard CLI Mode (`data "prompt"`)**:
    *   Functions as a traditional single-agent coding assistant, executing the given prompt.
    *   Uses a simplified approval workflow (see 5.3.2).

### 5.2. Multi-Agent Swarm System

1.  **Parallel Agent Execution**:
    *   Supports concurrent operation of multiple AI agents.
    *   Utilizes models from different providers: OpenAI (gpt-4.1, o3), Anthropic (claude-sonnet-4-20250514), Google (gemini-2.5-pro-preview-06-05).
2.  **Intelligent Task Distribution & Coordination**:
    *   A designated coordinator model (gemini-2.5-pro-preview-06-05) manages task assignments based on agent strengths and current workload.
    *   Agents can specialize (e.g., Gemini for coordination, Claude for analysis, GPT for speed).
3.  **Non-Blocking User Input**:
    *   Users can type commands or feedback at any time, even while agents are "thinking" or executing tasks.
    *   Input is queued and routed to the swarm coordinator for processing and integration into ongoing work.
4.  **Auto-Approval in Swarm Mode**:
    *   Once swarm mode is active, all subsequent operations by agents are auto-approved, enabling unattended operation.
    *   The swarm will only pause to ask clarifying questions if it cannot proceed.

### 5.3. User Interface & Controls

1.  **Cyberpunk Terminal Dashboard (Swarm Mode)**:
    *   Real-time display of:
        *   Active AI agents and their current models/status (idle, working).
        *   Number of pending/queued tasks.
        *   Number of completed tasks.
        *   Overall swarm status (e.g., `🚀AUTO` for auto-approval).
        *   Network connectivity status.
    *   Compact and stable design, minimizing re-renders and visual clutter.
    *   Clear indication that user input is `READY - Type anytime, no blocking!`.
2.  **Simplified Approval Workflow (Standard Mode)**:
    *   When an agent proposes a command, the user is presented with:
        *   `Yes`: Execute the command.
        *   `Yes, and don't ask again`: Execute and switch to full auto-approval for the current session.
        *   `Activate swarm mode and manage it yourself`: Switch to swarm mode with full auto-approval.
        *   (`Explain this command`, `Edit or give feedback`, `No, and keep going`, `No, and stop for now` are also available for fine-grained control if needed, but the primary options are simplified).
3.  **Slash Commands**:
    *   `/swarm`: Toggles AI swarm mode on/off. If turning on, enables auto-approval.
    *   `/network`: Toggles network access for AI agents.
    *   `/test`: Runs the end-to-end test suite for the swarm system.
    *   `/help`: Displays available commands and assistance.
    *   Other standard CLI commands (`/model`, `/approval`, `/clear`, etc.).
4.  **Syntax Highlighting**:
    *   Enhanced readability for code blocks (Python, TypeScript, JavaScript, Shell/Bash, etc.) in AI responses and logs.
    *   Patch/diff highlighting with distinct colors for additions (blue) and deletions (red), and styled hunk headers.
5.  **Cyberpunk Startup Animation**:
    *   Displayed when `data` (no args) is run.
    *   Visualizes the initial analysis phase:
        *   Initializing DATA CODEX SWARM (API key checks, provider loading)
        *   Scanning Codebase Structure (project type, file structure, git status)
        *   Identifying Project Goals (parsing README, `goals.md`, LLM logs, TODOs)
        *   Assessing Task Priorities (categorizing tasks, identifying dependencies)
        *   Deploying Agent Swarm (activating coordination, populating task queue)
    *   Shows concrete findings with checkmarks for each step.

### 5.4. Git Coordination

1.  **Automatic Branch Management**:
    *   Each task assigned to an agent is executed on a dedicated git branch.
    *   Branch naming convention: `agent/{agentId}/{taskId}` for clarity.
2.  **Automated Commits**:
    *   Agents automatically commit their work upon task completion with descriptive messages including agent and task information.
3.  **Merge Coordination**:
    *   System attempts to merge completed agent branches back into the main/target branch.
    *   Basic conflict detection (advanced resolution may be future work).
4.  **Clean Branch Lifecycle**:
    *   Handles branch creation, switching, and cleanup.

### 5.5. Shared Todo System & Task Management

1.  **AI-Coordinated Task Management**:
    *   Tasks are created from user prompts or autonomously by the swarm during codebase analysis.
    *   Managed by `SharedTodoManager`, visible to all agents.
2.  **Intelligent Assignment & Tracking**:
    *   Tasks are assigned to the most suitable available agent.
    *   Real-time status updates (pending, in-progress, completed, failed).
    *   Priority management for the task queue.

### 5.6. LLM Logs System

1.  **Comprehensive Activity Logging**:
    *   All inputs, outputs, tool calls, errors, decisions, and coordination messages for every agent are logged.
2.  **Standardized JSON Format**:
    *   Designed for both human readability and easy parsing by AI models.
    *   Includes timestamps, agent identifiers (ID, model, provider), task context, content summaries, raw data, token counts, and relevant metadata (git branch, working directory).
    *   Log types: `input`, `output`, `error`, `task`, `coordination`, `decision`, `summary`.
3.  **Organized Directory Structure**:
    *   Logs stored in `./LLM_LOGS/` within the project directory.
    *   Subdirectories for `sessions/`, `agents/`, `tasks/`, `coordination/`, `summaries/` for easy navigation and review.
4.  **Cross-Agent Visibility**:
    *   Logs serve as a shared "notepad" or reference, allowing agents to understand the context of work done by other agents.

### 5.7. Mobile Integration

1.  **QR Code Authentication**:
    *   Secure pairing of a mobile device with the CLI session via QR code scanning.
    *   QR code displayed in the terminal dashboard when swarm mode is active and no mobile device is connected.
2.  **Push Notifications**:
    *   Mobile device receives notifications for key swarm events (e.g., task completion, errors, user attention required).
3.  **(Framework for) Voice Commands & Remote Control**:
    *   The `MobileBridge` system is in place, providing a foundation for future implementation of voice commands and more detailed remote swarm management from a mobile app.

### 5.8. Network Management

1.  **Toggle Network Access**:
    *   Users can enable/disable network access for all AI agents via the `/network` slash command.
2.  **Visual Status**:
    *   Clear indication of network status (e.g., `🌐 ONLINE`, `📡 OFFLINE`) in the terminal UI and dashboard.
3.  **Domain Restriction Presets (Conceptual)**:
    *   The `NetworkManager` is built to support presets (DEV, SECURE, OFFLINE, UNRESTRICTED) for fine-grained control over allowed/blocked domains, although full UI for managing these presets is not the current focus.

### 5.9. End-to-End Testing System

1.  **Comprehensive Test Suite**:
    *   Activated via the `/test` slash command.
    *   Validates the entire cyberpunk AI swarm workflow, including multi-agent execution, git coordination, todo management, LLM logging, and API interactions.
2.  **Automated Validation & Reporting**:
    *   Provides a summary of test success or failure in the terminal.
    *   Generates detailed test reports within the `LLM_LOGS/` directory for troubleshooting.

## 6. Non-Functional Requirements

*   **Performance**:
    *   Swarm dashboard updates should be efficient, minimizing terminal flicker.
    *   Task distribution and agent activation should be responsive (<5 seconds).
    *   Non-blocking input should feel instantaneous.
*   **Reliability**:
    *   Graceful handling of individual agent failures or API errors, with attempts to reassign tasks or notify the user.
    *   Stable operation during long-running swarm sessions.
    *   LLM logging system must reliably capture all interactions.
*   **Usability**:
    *   Intuitive slash commands and clear visual feedback.
    *   The "magic `data` command" should provide a very low barrier to entry for complex operations.
    *   Error messages should be clear and actionable.
*   **Security**:
    *   API keys should be handled securely (primarily via environment variables).
    *   Network toggle provides a means to restrict external access.
    *   Sandboxing of command execution (inherited from base Codex CLI).
*   **Extensibility**:
    *   Modular architecture should allow for easy addition of new AI providers, agent specializations, or logging formats.

## 7. Success Metrics

*   **User Adoption**: Number of active users leveraging the swarm mode features.
*   **Task Completion Rate**: Percentage of complex tasks successfully completed by the AI swarm.
*   **Reduction in Development Time**: Measured through user feedback or case studies on specific project tasks.
*   **User Satisfaction**: Positive feedback regarding the ease of use, power, and stability of the swarm system.
*   **Stability**: Low crash rate, especially during swarm operations.
*   **Test Coverage**: High pass rate for the `/test` E2E suite.
*   **API Key Prompting**: System correctly identifies and prompts for necessary API keys for all configured providers.

## 8. Future Considerations (Beyond Current Scope)

*   Advanced inter-agent communication protocols (beyond LLM log sharing).
*   More sophisticated conflict resolution strategies for git merges.
*   Deeper mobile app integration with full dashboard mirroring and rich interactive controls.
*   User-configurable agent roles and team compositions.
*   Proactive cost estimation and budget management features.
*   Machine learning-driven adaptive model selection based on historical performance.