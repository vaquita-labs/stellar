# 1. Imagen base
FROM node:20-alpine

# 2. Crear directorio de trabajo
WORKDIR /app

# 3. Copiar package.json y lock
COPY package*.json ./

# 4. Instalar dependencias
RUN npm install

# 5. Copiar el resto del código
COPY . .

# 6. Compilar TS
# RUN npm run build
RUN npm install -g nodemon ts-node typescript

# 7. Exponer puerto
EXPOSE 3100

# 8. Comando por defecto
CMD ["npm", "run", "dev-all"]
