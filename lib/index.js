/**
 * Name-based workspace creation, host half.
 *
 * Registers one Typert Remote service, `quickWorkspace`, with two methods:
 * `describe` reports the parent directory new workspaces default into, and
 * `create` makes the directory and registers it as a Workspace. The browser
 * reaches both over the ordinary `/api` RPC channel, so no route, registry
 * entry or permission is needed: the Gateway auto-claims every endpoint a live
 * `TypertRemoteService` declares on its prototype.
 *
 * Why this exists: DSH's own directory picker resolves to the *native* backend
 * on any loopback darwin deployment, which is a renderless `osascript "choose
 * folder"`. That opens a Finder dialog on the host machine, so the button looks
 * dead to anyone driving the web UI from anywhere else — and the owner's
 * `directoryBusy` flag then stays latched, turning every later click into a
 * silent no-op. Creating by name needs no chooser at all.
 */
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

/**
 * A workspace folder name is a single path segment. This is the same rule the
 * Host's own directory-picker `createDirectory` enforces: no separators, no
 * `.`/`..`, no control characters, nothing blank. Without it a name would be a
 * path traversal out of the parent directory.
 */
const WORKSPACE_NAME = /^[^\p{Cc}/\\]{1,128}$/u;

/**
 * Declare one direct Remote method without decorator syntax: this runtime has
 * V8 decorators switched off, so `@Remote(…)` is a hard SyntaxError here.
 * `Remote(exportName)` returns the same decorator function the shipped
 * packages' compiler emits, and the only thing it needs from a decorator
 * context is `addInitializer`. The initializer derives the prototype from its
 * receiver, so it has to run against an instance.
 *
 * @param {object} Proto - Class carrying the method.
 * @param {string} method - Method name, which is also the wire export name.
 * @returns {void}
 */
function declareRemote(Proto, method) {
	const initializers = [];
	Remote(method)(void 0, {
		name: method,
		"static": false,
		private: false,
		addInitializer(initializer) {
			initializers.push(initializer);
		}
	});
	if (initializers.length !== 1) {
		throw new Error(`quick-workspace: cannot declare Remote method '${method}'`);
	}
	initializers[0].call(Object.create(Proto.prototype));
}

/**
 * Narrow one wire request to a usable folder name, trimming the padding a
 * paste or a mobile keyboard leaves behind.
 *
 * @param {unknown} request - Decoded wire argument.
 * @returns {string} the folder name.
 */
function nameOf(request) {
	const raw = typeof request?.name === "string" ? request.name.trim() : "";
	if (!WORKSPACE_NAME.test(raw)) {
		throw new RemoteError("quick-workspace/invalid-name", "a workspace name must be a single folder name: 1-128 characters, no / or \\, and not “.” or “..”", {
			name: typeof request?.name === "string" ? request.name : null
		});
	}
	return raw;
}

/**
 * Read the directory new workspaces land in by default.
 *
 * This cannot be `process.cwd()`: `dsh web` is normally a launchd KeepAlive
 * agent, so its working directory is `/` and a new workspace would land in the
 * filesystem root. The registry is the only place that knows which folder the
 * deployment calls its workspace, so the parent comes from there — the
 * first-use workspace first (the "Default workspace" row), then any workspace
 * at all, and only then the Host's working directory.
 *
 * `state.defaultWorkspaceId` is a plain field on the registry instance rather
 * than a published accessor, so every read here is defensive: the fallback
 * chain is what keeps this correct if that field ever goes away.
 *
 * @param {object} registry - The Host workspace registry.
 * @returns {string} an absolute parent directory.
 */
function defaultParent(registry) {
	const defaultId = registry.state?.defaultWorkspaceId;
	if (typeof defaultId === "string") {
		const workspace = registry.get(defaultId);
		if (workspace !== undefined) return dirname(workspace.path);
	}
	const [first] = registry.list();
	if (first !== undefined) return dirname(first.path);
	return resolve(process.cwd());
}

class QuickWorkspaceService extends TypertRemoteService {
	/** The registry owns the durable workspace records; nothing below may run before it exists. */
	static inject = ["workspaceRegistry"];

	/**
	 * @param {object} ctx - Host context carrying the injected services.
	 */
	constructor(ctx) {
		super(ctx, "quickWorkspace");
	}

	/**
	 * Report where a new workspace will be created, so the dialog can show the
	 * exact folder it is about to make instead of a bare name field.
	 *
	 * Declared with no parameters on purpose: the Gateway builds its argument
	 * descriptor from the signature, so a browser that sends `{args:{request:{}}}`
	 * is rejected with `gateway/arguments-invalid`.
	 *
	 * @returns {Promise<{parent: string}>} the default parent directory.
	 */
	async describe() {
		return { parent: this.parent() };
	}

	/**
	 * Create `<parent>/<name>`, register it as a Workspace, and report the path.
	 * Both halves are idempotent: the folder already exists on a repeat, and
	 * `workspaceRegistry.create` resolves an existing record instead of failing.
	 *
	 * Registering here (rather than letting the caller's adopt step do it) is
	 * what makes this usable — `WorkspaceRegistry.create` requires the directory
	 * to already be a directory, and nothing in the stock flow creates one.
	 *
	 * @param {{name: string}} request - Folder name to create.
	 * @returns {Promise<object>} the created workspace's path and title.
	 */
	async create(request) {
		const name = nameOf(request);
		const parent = this.parent();
		const path = join(parent, name);
		if (!isAbsolute(path) || path === parent) {
			throw new RemoteError("quick-workspace/invalid-name", `“${name}” does not name a folder inside ${parent}`, { name });
		}
		await mkdir(path, { recursive: true });
		const workspace = await this.ctx.workspaceRegistry.create(path, name);
		return { path: workspace.path, title: workspace.title, parent };
	}

	/**
	 * The parent directory, refusing the filesystem root.
	 *
	 * The root is what `process.cwd()` hands back for a launchd-started Host, and
	 * a `mkdir("/<name>")` against it fails as a bare EACCES that tells the user
	 * nothing. Refusing here instead turns "this deployment has no workspace to
	 * sit next to" into a sentence the dialog can show.
	 *
	 * @returns {string} an absolute parent directory below the root.
	 */
	parent() {
		const parent = defaultParent(this.ctx.workspaceRegistry);
		if (resolve(parent) === parse(parent).root) {
			throw new RemoteError("quick-workspace/no-parent", "this deployment has no registered workspace to create a new folder beside; add a workspace folder in Settings first");
		}
		return parent;
	}
}

declareRemote(QuickWorkspaceService, "describe");
declareRemote(QuickWorkspaceService, "create");

export { QuickWorkspaceService, QuickWorkspaceService as default, nameOf, defaultParent };
