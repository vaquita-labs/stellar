import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import router from './routes';

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.info(`[REQUEST] ${req.method} ${req.originalUrl}`);
  next();
});

app.use('/api/v1', router);

const PORT = process.env.PORT || 3000;


app.listen(PORT, () => {
  console.info(`Servidor escuchando en http://localhost:${PORT}`);
});
