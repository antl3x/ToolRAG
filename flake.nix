# flake.nix
{
  description = "Mono";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        
        baseTools = with pkgs; [ 
          go-task 
          direnv 
          pnpm 
          sops 
        ];
      in {
        devShells.default = pkgs.mkShell {
          packages = baseTools;
          shellHook = ''
            env_vars_required() {
              local environment
              local -i ret
              environment=$(env)
              ret=0

              for var in "$@"; do
                if [[ "$environment" != *"$var="* || -z ''${!var:-} ]]; then
                  echo "ERROR: env var $var is required but missing/empty" >&2
                  ret=1
                fi
              done
              return "$ret"
            }
          '';
        };
        packages = { inherit baseTools; };
      });
}