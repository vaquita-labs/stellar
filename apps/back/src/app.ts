// require('dotenv').config();
// require('reflect-metadata');
// import apiV1GroupRouter from 'app/group/route';
// import apiV1Router from 'app/route';
// import bodyParser from 'body-parser';
// import express from 'express';
// import { finishSetupApp, initialSetupApp } from 'helpers';
// import { errorLoggerHandler, errorResponderHandler, failSafeHandler, notFoundResponse, setCompany } from 'middlewares';
// import { dbClient } from 'services/database';
//
// const mainHandler = async (upCounter: number) => {
//
//   const app = initialSetupApp();
//
//   try {
//
//     await dbClient.connect();
//
//     finishSetupApp(app);
//
//     app.use(express.json());
//     app.use(express.urlencoded({ extended: false }));
//     app.use(bodyParser.urlencoded({
//       extended: true,
//     }));
//
//     app.use(errorLoggerHandler);
//     app.use(errorResponderHandler);
//     app.use(failSafeHandler);
//
//     app.use('/vaquita/api/v1', apiV1Router);
//     // @ts-ignore
//     app.use('/vaquita/api/v1/group', setCompany(), apiV1GroupRouter);
//
//     app.use(notFoundResponse);
//   } catch (error) {
//     void mainHandler(upCounter + 1);
//   }
// };
//
// void mainHandler(1);
