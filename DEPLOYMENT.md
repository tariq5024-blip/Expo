# Expo Asset – Production Deployment Guide (k3s, 3‑Tier)

## Overview
This repository contains a React SPA (web), a Node/Express API (app), and MongoDB (database). The deployment targets a k3s cluster spanning three VMs with strict placement per tier.

## Topology
- vm-web: k3s server (control plane) + Traefik Ingress; runs web Deployment (Nginx serving the built SPA).
- vm-app: k3s agent; runs app Deployment (Node/Express API).
- vm-database: k3s agent; runs MongoDB StatefulSet with persistent storage.

## Prerequisites
- Linux VMs with stable networking and firewalls opened as noted below.
- Docker or a compatible container runtime for building images.
- k3s installed (server on vm-web, agents on vm-app and vm-database).
- A container registry you can push to (Docker Hub/GitHub Container Registry/etc.).
- A domain for HTTPS ingress (e.g., expo.example.com).

## Install k3s
On vm-web (control plane):
1) curl -sfL https://get.k3s.io | sh -
2) Get node token for agents: sudo cat /var/lib/rancher/k3s/server/node-token

On vm-app and vm-database (agents):
1) curl -sfL https://get.k3s.io | K3S_URL=https://<vm-web-ip>:6443 K3S_TOKEN=<token> sh -

## Node Labels & Taint
Label nodes to pin workloads:
- kubectl label node <web-node> role=web
- kubectl label node <app-node> role=app
- kubectl label node <db-node> role=db

Optional taint to isolate DB:
- kubectl taint nodes <db-node> db-only=true:NoSchedule

## Build & Push Images
Replace <registry> with your registry (e.g., docker.io/<user> or ghcr.io/<org>):
1) docker build -f Dockerfile.app -t <registry>/expo-stores/app:1.0.0 .
2) docker push <registry>/expo-stores/app:1.0.0
3) docker build -f Dockerfile.web -t <registry>/expo-stores/web:1.0.0 .
4) docker push <registry>/expo-stores/web:1.0.0

Edit k8s/app.yaml and k8s/web.yaml to reference your image URLs if different.

## Configure DNS & TLS
Point expo.example.com to vm-web’s public IP.
Create a TLS secret in the cluster or install cert-manager. For manual TLS:
- kubectl -n expo-stores create secret tls expo-tls --cert fullchain.pem --key privkey.pem

## Apply Kubernetes Manifests
1) kubectl apply -f k8s/namespace.yaml
2) kubectl apply -f k8s/configmap.yaml
3) Secrets (choose one):
   - Option A: Edit k8s/secrets.yaml placeholders and apply:
     - kubectl apply -f k8s/secrets.yaml
   - Option B: Create secrets directly:
     - kubectl -n expo-stores create secret generic mongo-secret --from-literal=MONGO_INITDB_ROOT_USERNAME=<user> --from-literal=MONGO_INITDB_ROOT_PASSWORD=<pass>
     - kubectl -n expo-stores create secret generic app-secrets --from-literal=MONGO_URI="mongodb://<user>:<pass>@mongo-svc.expo-stores.svc.cluster.local:27017/expo-stores?authSource=admin" --from-literal=COOKIE_SECRET="<random>"
4) kubectl apply -f k8s/mongo.yaml
5) kubectl apply -f k8s/app.yaml
6) kubectl apply -f k8s/web.yaml
7) kubectl apply -f k8s/networkpolicy.yaml
8) kubectl apply -f k8s/ingress.yaml

## Configuration Notes
- k8s/configmap.yaml:
  - NODE_ENV=production
  - CORS_ORIGIN=https://expo.example.com
  - ENABLE_CSRF=true
  - COOKIE_SECURE=true
  - ENABLE_DEBUG_ROUTES=false
  - SEED_DEFAULTS=false
- k8s/secrets.yaml:
  - Replace placeholders before applying, or create secrets via kubectl as shown.
- Persistence:
  - MongoDB: 20Gi local-path PVC on vm-database.
  - App uploads/backups: 5Gi local-path PVCs on vm-app.
  - For multi-replica app with shared uploads/backups, move to RWX storage (NFS/Ceph) or object storage.

## Firewall / Ports
- Internet → vm-web: 80/443 (Traefik Ingress).
- Inter-node traffic: 6443 (API server), 9345 (k3s supervisor), 10250 (kubelet), 8472/UDP or 4789/UDP (flannel), plus node-to-node overlay.
- DB is ClusterIP only; no external port exposure.

## Health Checks
- API: https://expo.example.com/api/healthz and /api/readyz
- SPA: https://expo.example.com/

## Rolling Updates
- Update image tag in app.yaml or web.yaml and apply:
  - kubectl -n expo-stores set image deployment/expo-app app=<registry>/expo-stores/app:<tag>
  - kubectl -n expo-stores set image deployment/expo-web web=<registry>/expo-stores/web:<tag>

## Observability & Troubleshooting
- kubectl -n expo-stores get pods,svc,ingress
- kubectl -n expo-stores logs deploy/expo-app
- kubectl -n expo-stores logs deploy/expo-web
- kubectl -n expo-stores logs statefulset/mongo
- Verify node labels: kubectl get nodes --show-labels

## GitHub Push Instructions
Repository: https://github.com/tariq50243052-tech/Expo-Asset
1) git init
2) git branch -M main
3) git add -A
4) git commit -m "Initial commit: app, Dockerfiles, k8s manifests, deployment guide"
5) git remote add origin https://github.com/tariq50243052-tech/Expo-Asset.git
6) git push -u origin main

If prompted, authenticate with your GitHub credentials or a Personal Access Token. Ensure no secrets are committed (k8s/secrets.yaml contains placeholders only).

## Maintenance Checklist
- Rotate COOKIE_SECRET and DB credentials periodically.
- Keep Node and Docker base images up to date.
- Regular DB backups and off-cluster storage.
- Monitor logs and set up alerting as needed.
