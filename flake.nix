{
  description = "GH Dash development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        isLinux = pkgs.stdenv.isLinux;
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # -- Shared: Node/Bun --
            nodejs_22
            bun

            # -- Shared: Rust toolchain --
            cargo
            rustc
            rustfmt
            clippy
            cargo-tauri
            pkg-config
          ] ++ pkgs.lib.optionals isLinux [
            # -- Linux: Tauri GTK/WebKit deps --
            dbus
            openssl
            glib
            gtk3
            libsoup_3
            webkitgtk_4_1
            librsvg
          ];

          nativeBuildInputs = pkgs.lib.optionals isLinux [
            pkgs.wrapGAppsHook4
          ];

          shellHook = ''
            echo "GH Dash dev environment loaded"
            echo "Node: $(node --version)"
            echo "Cargo: $(cargo --version)"
          '' + pkgs.lib.optionalString isLinux ''
            export XDG_DATA_DIRS="$GSETTINGS_SCHEMAS_PATH:$XDG_DATA_DIRS"
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [
              pkgs.webkitgtk_4_1
              pkgs.gtk3
              pkgs.cairo
              pkgs.gdk-pixbuf
              pkgs.glib
              pkgs.dbus
              pkgs.openssl
              pkgs.librsvg
            ]}:$LD_LIBRARY_PATH"
          '';
        };
      });
}
