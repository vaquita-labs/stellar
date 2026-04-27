git pull
#sudo docker compose down
pm2 delete all
#pm2 stop app-api-ecosystem.config.cjs && pm2 delete app-api-ecosystem.config.cjs
pm2 start app-api-ecosystem.config.cjs
pm2 start app-listener-ecosystem.config.cjs
pm2 start app-job-deposits-history-ecosystem.config.cjs
pm2 status
pm2 save
docker compose -f docker-compose-pm2.yml up -d --build
