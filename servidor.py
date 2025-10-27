import os
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import messagebox
import tkinter.ttk as ttk


def _is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def _get_resource_root() -> Path:
    if _is_frozen():
        bundle_dir = getattr(sys, "_MEIPASS", None)
        if bundle_dir:
            return Path(bundle_dir)
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _get_working_dir() -> Path:
    if _is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


class ServerController:
    def __init__(self, master: tk.Tk) -> None:
        self.master = master
        self.master.title("Servidor Apresentação")
        self.master.geometry("420x460")
        self.master.resizable(False, False)
        self.master.configure(bg="#0f172a")

        self._frozen = _is_frozen()
        self._base_path = _get_resource_root()
        self._working_dir = _get_working_dir()
        self._icon_image = None
        self._set_window_icon()

        self.style = ttk.Style(self.master)
        try:
            self.style.theme_use("clam")
        except tk.TclError:
            pass

        self.style.configure("Root.TFrame", background="#0f172a")
        self.style.configure("Card.TFrame", background="#1e293b", borderwidth=0)
        self.style.configure("Header.TLabel", background="#0f172a", foreground="#e2e8f0", font=("Segoe UI Semibold", 15))
        self.style.configure("Subheader.TLabel", background="#0f172a", foreground="#94a3b8", font=("Segoe UI", 10))
        self.style.configure("Status.TLabel", background="#0f172a", foreground="#e2e8f0", font=("Segoe UI", 10))
        self.style.configure("CardLabel.TLabel", background="#1e293b", foreground="#e2e8f0", font=("Segoe UI", 10, "bold"))
        self.style.configure("CardValue.TLabel", background="#1e293b", foreground="#cbd5f5", font=("Segoe UI", 10))
        self.style.configure("Footer.TLabel", background="#0f172a", foreground="#64748b", font=("Segoe UI", 9))
        self.style.configure(
            "Accent.TButton",
            font=("Segoe UI Semibold", 10),
            background="#2563eb",
            foreground="#f8fafc",
            padding=8,
        )
        self.style.configure(
            "Danger.TButton",
            font=("Segoe UI Semibold", 10),
            background="#dc2626",
            foreground="#f8fafc",
            padding=8,
        )
        self.style.map(
            "Accent.TButton",
            background=[("!disabled", "#2563eb"), ("disabled", "#1e40af")],
            foreground=[("disabled", "#cbd5f5"), ("!disabled", "#f8fafc")],
        )
        self.style.map(
            "Danger.TButton",
            background=[("!disabled", "#dc2626"), ("disabled", "#7f1d1d")],
            foreground=[("disabled", "#f8d7da"), ("!disabled", "#f8fafc")],
        )

        self._status_var = tk.StringVar(value="Aguardando...")
        self._url_var = tk.StringVar(value="http://127.0.0.1:5000/")
        self._status_indicator = None
        self._status_dot_id = None
        self._status_colors = {
            "idle": "#94a3b8",
            "starting": "#fbbf24",
            "running": "#22c55e",
            "error": "#ef4444",
            "stopped": "#64748b",
        }
        self._process = None
        self._lock = threading.Lock()

        self._build_ui()
        self.master.protocol("WM_DELETE_WINDOW", self._on_close)

    def _resolve_path(self, *relative: str) -> Path:
        candidate = self._base_path.joinpath(*relative)
        if candidate.exists():
            return candidate
        return self._working_dir.joinpath(*relative)

    def _set_window_icon(self) -> None:
        icon_path = self._resolve_path("favicon.ico")
        if not icon_path.exists():
            return
        try:
            icon_image = tk.PhotoImage(file=str(icon_path))
            self.master.iconphoto(True, icon_image)
            self._icon_image = icon_image
        except tk.TclError:
            pass

    def _build_ui(self) -> None:
        container = ttk.Frame(self.master, padding=(24, 20, 24, 24), style="Root.TFrame")
        container.pack(fill=tk.BOTH, expand=True)

        header = ttk.Frame(container, style="Root.TFrame")
        header.pack(fill=tk.X)
        ttk.Label(header, text="Painel do Servidor", style="Header.TLabel").pack(anchor=tk.W)
        ttk.Label(
            header,
            text="Controle a execução do dashboard de apresentação.",
            style="Subheader.TLabel",
        ).pack(anchor=tk.W, pady=(2, 16))

        status_row = ttk.Frame(container, style="Root.TFrame")
        status_row.pack(fill=tk.X, pady=(0, 12))

        self._status_indicator = tk.Canvas(status_row, width=18, height=18, highlightthickness=0, bg="#0f172a")
        self._status_indicator.pack(side=tk.LEFT)
        self._status_dot_id = self._status_indicator.create_oval(
            3,
            3,
            15,
            15,
            fill=self._status_colors["idle"],
            outline="",
        )

        ttk.Label(status_row, text="Status:", style="Status.TLabel").pack(side=tk.LEFT, padx=(8, 4))
        ttk.Label(status_row, textvariable=self._status_var, style="Status.TLabel").pack(side=tk.LEFT)

        button_row = ttk.Frame(container, style="Root.TFrame")
        button_row.pack(fill=tk.X, pady=(4, 12))

        self._start_button = ttk.Button(
            button_row,
            text="Iniciar servidor",
            command=self.start_server,
            style="Accent.TButton",
        )
        self._start_button.pack(side=tk.LEFT, expand=True, fill=tk.X)

        self._stop_button = ttk.Button(
            button_row,
            text="Parar servidor",
            command=self.stop_server,
            state=tk.DISABLED,
            style="Danger.TButton",
        )
        self._stop_button.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=(12, 0))

        info_card = ttk.Frame(container, padding=16, style="Card.TFrame")
        info_card.pack(fill=tk.BOTH, expand=True)

        ttk.Label(info_card, text="URL do dashboard", style="CardLabel.TLabel").pack(anchor=tk.W)
        url_entry = ttk.Entry(info_card, textvariable=self._url_var, font=("Segoe UI", 10), state="readonly")
        url_entry.pack(fill=tk.X, pady=(8, 12))

        ttk.Button(info_card, text="Abrir no navegador", command=self.open_browser, style="Accent.TButton").pack(fill=tk.X)

        ttk.Separator(info_card, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=(14, 12))

        ttk.Label(
            info_card,
            text="Dica: inicie o servidor antes de compartilhar o link.",
            style="CardValue.TLabel",
        ).pack(anchor=tk.W)

        ttk.Label(
            container,
            text="Feche o painel para encerrar o servidor automaticamente.",
            style="Footer.TLabel",
        ).pack(anchor=tk.W, pady=(16, 0))

    def start_server(self) -> None:
        with self._lock:
            if self._process and self._process.poll() is None:
                messagebox.showinfo("Servidor", "O servidor já está em execução.")
                return

            if self._frozen:
                command = [sys.executable, "--run-server"]
            else:
                main_script = self._resolve_path("main.py")
                if not main_script.exists():
                    messagebox.showerror("Erro", f"main.py não encontrado em {self._base_path}")
                    return
                command = [sys.executable, str(main_script)]

            env = os.environ.copy()
            env.setdefault("PYTHONUNBUFFERED", "1")
            if self._frozen:
                env.pop("FLASK_DEBUG", None)

            popen_kwargs = {
                "cwd": str(self._working_dir),
                "stdout": subprocess.PIPE,
                "stderr": subprocess.PIPE,
                "text": True,
                "env": env,
            }

            if self._frozen and os.name == "nt":
                popen_kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)

            try:
                self._process = subprocess.Popen(command, **popen_kwargs)
            except OSError as error:
                messagebox.showerror("Erro", f"Não foi possível iniciar o servidor: {error}")
                self._set_status("Erro ao iniciar", "error")
                return

            threading.Thread(target=self._monitor_process, daemon=True).start()
            self._set_status("Iniciando servidor...", "starting")
            self._start_button.config(state=tk.DISABLED)
            self._stop_button.config(state=tk.NORMAL)
            threading.Thread(target=self._auto_open_browser, daemon=True).start()

    def _monitor_process(self) -> None:
        process = self._process
        if not process:
            return
        process.wait()
        with self._lock:
            self._process = None
        self.master.after(0, self._on_process_stopped)

    def _auto_open_browser(self) -> None:
        time.sleep(2)
        self.open_browser()
        self.master.after(0, lambda: self._set_status("Servidor em execução", "running"))

    def _on_process_stopped(self) -> None:
        self._set_status("Servidor parado", "stopped")
        self._start_button.config(state=tk.NORMAL)
        self._stop_button.config(state=tk.DISABLED)

    def stop_server(self) -> None:
        with self._lock:
            process = self._process
            if not process or process.poll() is not None:
                self._process = None
                self._set_status("Servidor parado", "stopped")
                self._start_button.config(state=tk.NORMAL)
                self._stop_button.config(state=tk.DISABLED)
                return

            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()

            self._process = None

        self._set_status("Servidor parado", "stopped")
        self._start_button.config(state=tk.NORMAL)
        self._stop_button.config(state=tk.DISABLED)

    def open_browser(self) -> None:
        url = self._url_var.get()
        if not url:
            return
        webbrowser.open(url)

    def _on_close(self) -> None:
        if messagebox.askokcancel("Sair", "Deseja encerrar o servidor e fechar a interface?"):
            self.stop_server()
            self.master.destroy()

    def _set_status(self, text: str, tone: str = "idle") -> None:
        self._status_var.set(text)
        if self._status_indicator and self._status_dot_id is not None:
            color = self._status_colors.get(tone, self._status_colors["idle"])
            self._status_indicator.itemconfig(self._status_dot_id, fill=color)


def _run_server_mode() -> None:
    os.chdir(str(_get_resource_root()))
    from main import app

    app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)


def main() -> None:
    if "--run-server" in sys.argv:
        _run_server_mode()
        return

    root = tk.Tk()
    ServerController(root)
    root.mainloop()


if __name__ == "__main__":
    main()
