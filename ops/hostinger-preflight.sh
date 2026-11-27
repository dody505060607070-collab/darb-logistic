#!/usr/bin/env bash
# Read-only Hostinger VPS inventory for Darb migration.
# Does not install, stop, restart, or modify any service or file.
set -u

section() { printf '\n===== %s =====\n' "$1"; }

section "Timestamp and host"
date -Is 2>/dev/null || date
hostnamectl 2>/dev/null || hostname
uname -a

section "OS and resources"
cat /etc/os-release 2>/dev/null || true
free -h 2>/dev/null || true
df -hT 2>/dev/null || df -h
nproc 2>/dev/null || true
uptime 2>/dev/null || true

section "Container runtime"
docker version --format 'Client={{.Client.Version}} Server={{.Server.Version}}' 2>&1 || true
docker compose version 2>&1 || true
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>&1 || true
docker compose ls 2>&1 || true
docker network ls 2>&1 || true

section "Listening TCP ports"
ss -ltnp 2>&1 || netstat -ltnp 2>&1 || true

section "Reverse proxy services"
for unit in nginx caddy traefik apache2; do
  systemctl is-active "$unit" 2>/dev/null && systemctl status "$unit" --no-pager -n 3 2>/dev/null || true
done

section "Firewall"
ufw status verbose 2>&1 || true
iptables -S 2>&1 | head -80 || true

section "Scheduled jobs (names/timing only)"
crontab -l 2>&1 || true
ls -la /etc/cron.d /etc/cron.hourly /etc/cron.daily 2>/dev/null || true
systemctl list-timers --all --no-pager 2>&1 | head -80 || true

section "Running services (summary)"
systemctl list-units --type=service --state=running --no-pager 2>&1 | head -100 || true

section "End"
printf 'Read-only inventory complete. No changes were made.\n'
