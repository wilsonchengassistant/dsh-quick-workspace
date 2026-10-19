/**
 * Name-based workspace creation, browser half.
 *
 * Occupies both directory-flow holes — the sidebar header's "Add workspace"
 * button and the composer's "Choose workspace" — with a name dialog instead of
 * an OS folder chooser. Registering at a negative priority shadows whatever
 * picker the deployment composed: `SlotCore.register` sorts a single-kind slot's
 * entries by ascending priority and the lowest renders, so this occupant wins
 * without fighting the native/browse plugin for the seat (which would just
 * throw "already has a registration").
 *
 * The dialog only has to hand back a path. `WorkspacePickFlow.adoptDirectory`
 * then resolves it against the registry and opens a session, so registering the
 * Workspace here (the Host half does it, because `WorkspaceRegistry.create`
 * requires the directory to already exist) is all the adoption needs.
 *
 * This file is served raw as a classic script and registers a factory; every
 * side effect, including `React.createElement` work, belongs inside it.
 */
window.__ModuleLoader__.load({
	id: "dsh-quick-workspace",
	factory(require) {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var react_jsx_runtime = require("react/jsx-runtime");
		var _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		/** Dictionary namespace owned by this plugin. */
		const NS = "quickWorkspace";

		/**
		 * Below the shipped pickers' default priority 0, so this occupant is the
		 * winner of a single-kind slot rather than a registration conflict.
		 */
		const SHADOW_PRIORITY = -100;

		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"dialog.title": "新增工作區",
			"dialog.desc": "輸入資料夾名稱，DSH 會在 {parent} 下建立這個資料夾並立即開啟。",
			"field.label": "工作區名稱",
			"field.placeholder": "例如 research-notes",
			"field.hint": "只支援單一資料夾名稱，不可包含 / 或 \\。",
			"target": "將建立於 {path}",
			"close": "關閉",
			"cancel": "取消",
			"create": "建立工作區",
			"creating": "正在建立…",
			"failed": "建立失敗",
			"error.blank": "請輸入工作區名稱。"
		};

		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"dialog.title": "New workspace",
			"dialog.desc": "Name the folder and DSH creates it under {parent}, then opens it.",
			"field.label": "Workspace name",
			"field.placeholder": "e.g. research-notes",
			"field.hint": "A single folder name — / and \\ are not allowed.",
			"target": "Will be created at {path}",
			"close": "Close",
			"cancel": "Cancel",
			"create": "Create workspace",
			"creating": "Creating…",
			"failed": "Could not create it",
			"error.blank": "Enter a workspace name."
		};

		/**
		 * Call one method on this plugin's Host Remote service and unwrap the
		 * Gateway's result envelope. `Connection.rpc.call` resolves to the
		 * `{ok, value | error}` envelope itself, so every caller must unwrap —
		 * reading a field straight off the envelope is the easy miss, and it
		 * fails silently (an `undefined` parent, an `undefined` path) rather
		 * than throwing.
		 *
		 * The Gateway derives its argument descriptor from the Host method's
		 * signature, so a parameterless `describe` must be sent `{args:{}}`;
		 * passing `{args:{request:{}}}` is rejected outright with
		 * `gateway/arguments-invalid`.
		 *
		 * @param {object} ctx - Client root context.
		 * @param {string} method - Remote export name.
		 * @param {object} [request] - Wire request argument; omit for no parameters.
		 * @returns {Promise<object>} the decoded host result.
		 */
		async function callHost(ctx, method, request) {
			const payload = { args: request === undefined ? {} : { request } };
			const result = await ctx.connection.rpc.call("/api", `quickWorkspace/${method}`, payload);
			if (!result.ok) {
				const failure = new Error(result.error?.message ?? `the host refused quickWorkspace/${method}`);
				failure.code = result.error?.code;
				throw failure;
			}
			return result.value;
		}

		/** Join a parent directory and a folder name for the preview line. */
		function previewPath(parent, name) {
			if (parent === null || name.trim() === "") return null;
			return `${parent.replace(/\/+$/, "")}/${name.trim()}`;
		}

		function QuickWorkspaceDialog(props) {
			const { open, busy, onPicked, onCancel, describeParent, createWorkspace, t } = props;
			// The slot's `inject` factory rebuilds its object each render, so the
			// callbacks are read through a ref rather than used as effect deps.
			const latest = react.useRef(props);
			latest.current = props;
			const [name, setName] = react.useState("");
			const [parent, setParent] = react.useState(null);
			const [creating, setCreating] = react.useState(false);
			const [error, setError] = react.useState(null);
			const inputRef = react.useRef(null);
			const armed = react.useRef(false);

			react.useEffect(() => {
				if (!open) {
					armed.current = false;
					return;
				}
				// One describe per rising edge: re-renders while `open` stays true
				// must not re-fetch, and a cancel must re-arm the next request.
				if (armed.current) return;
				armed.current = true;
				setName("");
				setError(null);
				setCreating(false);
				let live = true;
				latest.current.describeParent().then((described) => {
					if (live) setParent(described.parent);
				}).catch(() => {
					// The preview line is a nicety; the create call is what reports.
					if (live) setParent(null);
				});
				return () => {
					live = false;
				};
			}, [open]);

			react.useEffect(() => {
				if (!open) return;
				// The modal mounts its own layer after this effect, so defer the
				// focus by one frame or it lands on the still-detached input.
				const handle = setTimeout(() => inputRef.current?.focus(), 0);
				return () => clearTimeout(handle);
			}, [open]);

			if (!open) return null;

			const pending = busy || creating;
			const target = previewPath(parent, name);
			const close = () => {
				if (!pending) onCancel();
			};
			const submit = () => {
				if (pending) return;
				const trimmed = name.trim();
				if (trimmed === "") {
					setError(t("error.blank"));
					return;
				}
				setCreating(true);
				setError(null);
				latest.current.createWorkspace({ name: trimmed }).then((result) => {
					latest.current.onPicked(result.path);
				}).catch((reason) => {
					setCreating(false);
					setError(reason instanceof Error ? reason.message : String(reason));
				});
			};

			return (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: close,
				closeLabel: t("close"),
				title: t("dialog.title"),
				description: t("dialog.desc", { parent: parent ?? "" }),
				footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, {
					children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						disabled: pending,
						onClick: close,
						children: t("cancel")
					}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "primary",
						disabled: pending,
						onClick: submit,
						children: pending ? t("creating") : t("create")
					})]
				}),
				children: [(0, react_jsx_runtime.jsxs)("label", {
					style: { display: "flex", flexDirection: "column", gap: "6px" },
					children: [(0, react_jsx_runtime.jsx)("span", {
						style: { color: "var(--dsw-alias-label-secondary)", fontSize: "13px", lineHeight: "18px" },
						children: t("field.label")
					}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
						ref: inputRef,
						icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenOutlineRegular, { size: 14 }),
						value: name,
						disabled: pending,
						maxLength: 128,
						placeholder: t("field.placeholder"),
						"aria-label": t("field.label"),
						onChange: (event) => {
							setName(event.target.value);
							if (error !== null) setError(null);
						},
						onKeyDown: (event) => {
							if (event.key !== "Enter") return;
							event.preventDefault();
							submit();
						}
					})]
				}), (0, react_jsx_runtime.jsx)("div", {
					style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "16px", marginTop: "8px" },
					children: t("field.hint")
				}), target !== null && (0, react_jsx_runtime.jsx)("div", {
					style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "16px", marginTop: "4px", overflowWrap: "anywhere" },
					children: t("target", { path: target })
				}), error !== null && (0, react_jsx_runtime.jsx)("div", {
					role: "alert",
					style: { color: "var(--dsw-alias-state-danger, var(--dsw-alias-label-primary))", fontSize: "13px", lineHeight: "18px", marginTop: "8px" },
					children: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, {
						children: [(0, react_jsx_runtime.jsx)("strong", { children: `${t("failed")}: ` }), error]
					})
				})]
			});
		}

		/** Required Client services. */
		const inject = ["slots", "locale", "connection"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "quick-workspace: dictionaries");

			const injected = () => ({
				describeParent: () => callHost(ctx, "describe"),
				createWorkspace: (request) => callHost(ctx, "create", request)
			});

			/**
			 * Claim one directory-flow hole. A `register` throw is not fatal: the
			 * deployment's own picker simply keeps the seat and this plugin
			 * contributes nothing there, which is better than failing to load.
			 *
			 * @param {string} hole - Slot name to shadow.
			 * @returns {void}
			 */
			const occupy = (hole) => ctx.slots.inject(hole, () => {
				try {
					return ctx.slots.register({
						name: hole,
						priority: SHADOW_PRIORITY,
						locale: NS,
						inject: injected
					}, QuickWorkspaceDialog);
				} catch (error) {
					console.warn(`quick-workspace: could not take the ${hole} seat — ${String(error)}`);
					return () => {};
				}
			});

			occupy("sidebar.workspaces.directoryFlow");
			occupy("conversation.hero.workspace.directoryFlow");
		}

		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
