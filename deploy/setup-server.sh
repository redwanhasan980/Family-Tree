#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu (22.04/24.04) or Debian (12) VPS for শিকড় (Shikor).
# Run it yourself as root on the server; it never needs your password to leave the server.
#
#   curl -fsSL https://raw.githubusercontent.com/redwanhasan980/Family-Tree/main/deploy/setup-server.sh -o setup-server.sh
#   less setup-server.sh            # read it first
#   bash setup-server.sh --deploy-key "ssh-ed25519 AAAA... github-actions-deploy" [--domain shikor.app]
#
# What it does: system updates; Docker Engine + Compose; a "deploy" user that GitHub Actions
# uses (key login only, member of the docker group); /opt/shikor with the compose stack;
# firewall (SSH, HTTP, HTTPS); fail2ban; automatic security updates; a swap file on small
# servers. With --harden-ssh it also turns off SSH password login (only after checking that
# root or another sudo user already has an SSH key, so you cannot lock yourself out).
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/redwanhasan980/Family-Tree/main/deploy"
APP_DIR=/opt/shikor
DEPLOY_USER=deploy
DEPLOY_KEY=""
DOMAIN=""
HARDEN_SSH=0

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

while (($#)); do
  case "$1" in
    --deploy-key) DEPLOY_KEY="${2:-}"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --harden-ssh) HARDEN_SSH=1; shift ;;
    -h | --help) sed -n '2,15p' "$0"; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

[[ "$(id -u)" -eq 0 ]] || die "run as root (for example: sudo bash setup-server.sh ...)"
# shellcheck source=/dev/null
. /etc/os-release
[[ "$ID" == ubuntu || "$ID" == debian ]] || die "this script supports Ubuntu and Debian only"
[[ "$DEPLOY_KEY" =~ ^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa)\ [A-Za-z0-9+/=]+(\ .*)?$ ]] ||
  die "--deploy-key must be an SSH public key (the .pub file of the GitHub Actions deploy key)"
if [[ -n "$DOMAIN" && ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+(,\ ?[A-Za-z0-9.-]+)*$ ]]; then
  die "--domain looks wrong: $DOMAIN"
fi

export DEBIAN_FRONTEND=noninteractive

step "Updating the system"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades

step "Installing Docker Engine and Compose"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

step "Creating the '$DEPLOY_USER' user for GitHub Actions"
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
passwd -l "$DEPLOY_USER" >/dev/null # key login only
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
KEYS="/home/$DEPLOY_USER/.ssh/authorized_keys"
touch "$KEYS"
grep -qxF "$DEPLOY_KEY" "$KEYS" || printf '%s\n' "$DEPLOY_KEY" >>"$KEYS"
chown "$DEPLOY_USER:$DEPLOY_USER" "$KEYS"
chmod 600 "$KEYS"

step "Preparing $APP_DIR"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
for file in compose.yml Caddyfile deploy.sh; do
  curl -fsSL "$REPO_RAW/$file" -o "$APP_DIR/$file"
done
chmod 755 "$APP_DIR/deploy.sh"
if [[ ! -f "$APP_DIR/.env" ]]; then
  curl -fsSL "$REPO_RAW/env.server.example" -o "$APP_DIR/.env"
  # Generate the cron secret here so it never has to be typed or sent anywhere.
  sed -i "s|^CRON_SECRET=.*|CRON_SECRET=$(openssl rand -hex 32)|" "$APP_DIR/.env"
fi
if [[ -n "$DOMAIN" ]]; then
  sed -i "s|^SITE_ADDRESS=.*|SITE_ADDRESS=$DOMAIN|" "$APP_DIR/.env"
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
chmod 600 "$APP_DIR/.env"

step "Configuring the firewall (SSH, HTTP, HTTPS)"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null # HTTP/3
ufw --force enable >/dev/null
ufw status verbose | sed -n '1,12p'

step "Enabling fail2ban and automatic security updates"
systemctl enable --now fail2ban
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

step "Adding swap if the server has none"
if ! swapon --show | grep -q .; then
  mem_mb=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
  if ((mem_mb < 8192)); then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
    echo "added a 2 GB swap file"
  fi
fi

if ((HARDEN_SSH)); then
  step "Turning off SSH password login"
  has_admin_key=0
  [[ -s /root/.ssh/authorized_keys ]] && has_admin_key=1
  for home in /home/*; do
    user="$(basename "$home")"
    [[ "$user" == "$DEPLOY_USER" ]] && continue
    if id -nG "$user" 2>/dev/null | grep -qw sudo && [[ -s "$home/.ssh/authorized_keys" ]]; then has_admin_key=1; fi
  done
  ((has_admin_key)) || die "add your own SSH key for root or a sudo user first; otherwise you would be locked out"
  cat >/etc/ssh/sshd_config.d/60-shikor-hardening.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
  sshd -t
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
  echo "SSH now accepts keys only."
fi

step "Done"
cat <<NEXT
Next steps (details in docs/DEPLOYMENT.md):
  1. Fill in the server secrets:   nano $APP_DIR/.env
  2. Add the GitHub secrets and variables, then run the "Deploy" workflow.
  3. Check the site:               curl -s http://<server-ip>/api/health
     Logs:                         cd $APP_DIR && docker compose logs -f web
NEXT
