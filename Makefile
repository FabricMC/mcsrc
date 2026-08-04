build-all: desktop-mac desktop-windows desktop-linux

desktop-run:
	deno desktop --hmr --exclude node_modules .

desktop-mac:
	deno desktop --target aarch64-apple-darwin --output ./desktop-dist/macos/mcsrc.app --exclude node_modules .

desktop-windows:
	deno desktop --target x86_64-pc-windows-msvc --output ./desktop-dist/windows/mcsrc --exclude node_modules .

desktop-linux:
	deno desktop --target x86_64-unknown-linux-gnu --output ./desktop-dist/linux/mcsrc.AppImage --exclude node_modules .
