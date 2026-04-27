# Deploying Services into a New VM

This guide explains how to deploy **Vaquita services** on a fresh virtual machine (VM).

## 1. Install Docker & Docker Compose

Make sure Docker and Docker Compose are installed on your VM.

```bash
sudo apt update
sudo apt install -y docker.io docker-compose
sudo systemctl enable docker
sudo systemctl start docker
```

Verify the installation:

```bash
docker --version
docker compose version
```

## 1. Install NVM & NodeJs & PM2

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm list-remote --lts
nvm install v22.21.1
npm install -g pm2
```

## 2. Create Project Directory

Create and move into the deployment folder:

```bash
mkdir -p /root/vaquita && cd /root/vaquita
```

## 3. Configure DNS

Add an **A record** for your API subdomain that points to the VM’s public IP:

| Record Type | Host                   | Value (IP)            |
|-------------|------------------------|-----------------------|
| A           | api-service.vaquita.fi | `<YOUR_VM_PUBLIC_IP>` |

## 4. Clone the Repository

Clone the Vaquita Services repository from GitHub using your Personal Access Token (PAT):

```bash
git clone https://<YOUR_GITHUB_PAT>@github.com/vaquita-fi/vaquita-services.git
cd vaquita-services
```

## 5. Launch Initial Nginx (for SSL Challenge)

Before generating SSL certificates, we need a temporary Nginx instance to serve the Let’s Encrypt HTTP challenge on
/.well-known/acme-challenge/.
This ensures Certbot can verify domain ownership.

```shell
sudo docker compose -f docker-compose.initial.yml up -d
```

Confirm that Nginx is running

```shell
sudo docker compose -f docker-compose.initial.yml ps
```

You can test that the challenge folder is served correctly by running:

```shell
mkdir -p ./certbot/www/.well-known/acme-challenge
echo "test" > ./certbot/www/.well-known/acme-challenge/test.txt
curl http://api-service.vaquita.fi/.well-known/acme-challenge/test.txt
```

> If you see the word test in the output, the setup is correct and Certbot will succeed.

## 6. Generate SSL Certificates (Let’s Encrypt)

With the temporary Nginx service running, you can now use Certbot to request and generate SSL certificates for your
domain.

```bash
docker run --rm -it   -v ./certbot/conf:/etc/letsencrypt   -v ./certbot/www:/var/www/certbot   certbot/certbot certonly   --webroot -w /var/www/certbot   -d api-service.vaquita.fi
```

> Make sure port 80 is open and the domain points correctly to the VM before running this command.

Verify Successful Certificate Creation

Once the certificate has been successfully created, you can stop and remove the initial Nginx container:

```shell
sudo docker compose -f docker-compose.initial.yml down
```

## 7. Create the Environment File

Create a `.env` file in the project root with the required configuration:

```dotenv
PORT=3000
NODE_ENV=production

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

PRIVATE_KEY=
SERVER_PRIVATE_KEY=

PRIVY_APP_ID=
PRIVY_APP_SECRET=

ABLY_KEY=
```

> Keep this file secret — it contains sensitive keys.

## 8. Start the Services

Build and start all containers in detached mode:

```bash
sudo docker compose up -d --build
```

> Your services should now be running and accessible via `https://api-service.vaquita.fi`

# Updating the Services

To update to the latest version:

```bash
git pull
sudo docker compose down
sudo docker compose up -d --build
```

> This stops old containers, pulls new code, rebuilds, and restarts everything cleanly.

## Tips

- Check logs: `sudo docker compose logs -f`
- Restart only one service: `sudo docker compose restart <service_name>`
- Check status: `sudo docker compose ps`
