// import { LogLevel } from '@juki-team/commons';
// import { TELEGRAM_JUKI_QUIZ_BOT_TOKEN } from 'config/settings';
// import { logMessage } from 'helpers';
// // import { JSDOM } from 'jsdom';
// // import { Context, Markup, NarrowedContext, session, Telegraf } from 'telegraf';
// // import { CallbackQuery, InlineKeyboardButton, KeyboardButton, Update } from 'telegraf/typings/core/types/typegram';
// // import { ExtraEditMessageText } from 'telegraf/typings/telegram-types';
// import { v4 } from 'uuid';
//
// if (!TELEGRAM_JUKI_QUIZ_BOT_TOKEN) throw new Error('"TELEGRAM_JUKI_QUIZ_BOT_TOKEN" env var is required!');
//
// // const { document } = (new JSDOM(`<!DOCTYPE html><p>Hello world</p>`)).window;
//
// /**
//  * We can define our own context object.
//  *
//  * We now have to set the scene object under the `scene` property. As we extend
//  * the scene session, we need to pass the type in as a type variable.
//  */
//
// interface SessionData {
//   quizId: string,
//   lastMessage: {
//     id: number,
//     chatId: string,
//   }
// }
//
// interface MyContext extends Context {
//   session?: SessionData;
//   // will be available under `ctx.myContextProp`
//   myContextProp: string;
// }
//
// export const jukiQuizBot = new Telegraf<MyContext>(TELEGRAM_JUKI_QUIZ_BOT_TOKEN);
//
// jukiQuizBot.use(session());
//
// jukiQuizBot.start((ctx) => ctx.reply('Welcome'));
// jukiQuizBot.help((ctx) => ctx.reply('Send me a sticker'));
//
// interface Quiz {
//   id: string,
//   ownerId: number,
//   messages: { id: number, chatId: number, userId: number }[],
//   title: string,
//   timestamp: number,
//   questions: {
//     question: '',
//     answers: { [key: string]: { timestamp: number, answer: string, username: string, userId: number } }
//   }[],
//   closed: boolean,
//   publicAnswers: boolean,
// }
//
// const quizzes: { [key: string]: Quiz } = {};
//
// const BUTTON_TEXT_TITLE = 'Título';
// const BUTTON_TEXT_ADD_QUESTION = 'Añadir pregunta';
// const BUTTON_TEXT_QUESTION = 'Pregunta';
// const BUTTON_TEXT_ANSWER = 'Respuesta';
// const DEFAULT_QUIZ_TITLE = 'título del cuestionario no establecido';// 'quiz title not set';
//
// const getQuizEditKeyboardButtons = (quiz: Quiz) => {
//   const buttons = quiz.questions.map((question, index) => (
//     Markup.button.webApp(`${BUTTON_TEXT_QUESTION} ${index + 1}`, `https://bot.juki-ui.com/input/text`)
//   ));
//   const chunkSize = 3;
//   const chunkedButtons: InlineKeyboardButton.WebAppButton[][] = [];
//   for (let i = 0; i < buttons.length; i += chunkSize) {
//     const chunk = buttons.slice(i, i + chunkSize);
//     chunkedButtons.push(chunk);
//   }
//   return [
//     [ Markup.button.webApp(BUTTON_TEXT_TITLE, `https://bot.juki-ui.com/input/text`) ],
//     [ Markup.button.webApp(BUTTON_TEXT_ADD_QUESTION, `https://bot.juki-ui.com/input/text`) ],
//     ...chunkedButtons,
//   ];
// };
//
// const getQuizAnswerKeyboardButtons = (quiz: Quiz) => {
//   const buttons = quiz.questions.map((question, index) => (
//     Markup.button.webApp(`${BUTTON_TEXT_ANSWER} ${index + 1}`, `https://bot.juki-ui.com/input/text`)
//   ));
//   const chunkSize = 3;
//   const chunkedButtons: InlineKeyboardButton.WebAppButton[][] = [];
//   for (let i = 0; i < buttons.length; i += chunkSize) {
//     const chunk = buttons.slice(i, i + chunkSize);
//     chunkedButtons.push(chunk);
//   }
//   return [
//     ...chunkedButtons,
//   ];
// };
//
// function extractContent(html: string) {
//   const span = document.createElement('span');
//   span.innerHTML = html;
//   return span.textContent || span.innerText;
// }
//
// const printHeader = (text: string) => {
//   return `\n<b>${text.toUpperCase()}</b>`;
//   const spaces = 36 - text.length;
//   if (spaces > 1) {
//     const left = '-'.repeat(Math.floor(spaces / 2));
//     const right = '-'.repeat(Math.ceil(spaces / 2));
//     return `<pre>${left}${text}${right}</pre>`;
//   }
//   return `<pre>-${text}-</pre>`;
// };
//
// const printText = (text: string) => {
//   return `<i><b>${text}</b></i>`;
// };
//
// const getQuizText = (quiz: Quiz, userId: number, chatId: number): [ string, ExtraEditMessageText ] => {
//   const questions = quiz.questions
//     .map((question, index) => {
//       const answer = (question.answers[userId]) || { timestamp: 0, answer: '' };
//       return `${printText(`Pregunta ${index + 1}`)} ${answer.timestamp ? '<code>[■]</code>' : '<code>[ ]</code>'} ${printText(':')}
// ${question.question}${answer.timestamp ? '\n<b>Tu respuesta:</b>\n' : ''}${answer.answer}`;
//     });
//   const isOwnerChat = quiz.ownerId === chatId;
//   return [
//     `${quiz.title || printText(DEFAULT_QUIZ_TITLE)}
// ${printHeader(`Leyenda`)}
// <pre><code>[■]</code>: answered\n<code>[ ]</code>: not answered</pre>
// ${printHeader(`Cuestionario de ${quiz.questions?.length} preguntas`)}${questions.length ? '\n' + questions.join('\n\n') : ''}
// ${(isOwnerChat || quiz.publicAnswers) ? (
//       printHeader(`Respuestas`) +
//       quiz.questions.map((question, index) => (
//         printHeader(`Pregunta ${index + 1}`) + '\n' +
//         (
//           Object.values(question.answers).map(answer => `<a href="tg://user?id=${answer.userId}">${answer.username}</a> (${~~((answer.timestamp - quiz.timestamp) / 1000)} s):\n${answer.answer}`).join(`\n\n`) ||
//           printText('sin respuestas')
//         )
//       )).join('\n')
//     ) : ''}`,
//     {
//       parse_mode: 'HTML',
//       ...Markup.inlineKeyboard([
//         ...(!quiz.closed ? [ Markup.button.callback('Responder', `answer-quiz:${quiz.id}`) ] : []),
//         ...(isOwnerChat ? [
//           Markup.button.callback('✏️', `edit-quiz:${quiz.id}`),
//           quiz.closed ? Markup.button.callback('🔓', `open-quiz:${quiz.id}`) : Markup.button.callback('🔒', `close-quiz:${quiz.id}`),
//           quiz.publicAnswers ? Markup.button.callback('🙈', `hide-answers-quiz:${quiz.id}`) : Markup.button.callback('👀', `show-answers-quiz:${quiz.id}`),
//         ] : []),
//       ]),
//     },
//   ];
// };
//
// const getQuizzesText = (ownerId: number): [ string, ExtraEditMessageText? ] => {
//   const buttonsCallback = Object.values(quizzes).filter(quiz => quiz.ownerId == ownerId)
//     .map((quiz, index) => Markup.button.callback(`(${index + 1}) ${extractContent(quiz.title || DEFAULT_QUIZ_TITLE)}`, `start-quiz:${quiz.id}`));
//   if (buttonsCallback.length) {
//     return [
//       `Elige cual cuestionario empezar:`,
//       {
//         parse_mode: 'HTML',
//         ...Markup.inlineKeyboard([
//           ...buttonsCallback,
//         ]),
//       },
//     ];
//   }
//   return [ `No tienes cuestionarios :(` ];
// };
//
// const updateQuiz = (ctx: Context, quiz: Quiz) => {
//   for (const message of quiz.messages) {
//     ctx.telegram.editMessageText(message.chatId, message.id, '', ...getQuizText(quiz, message.userId, message.chatId)).catch(e => console.error('e:', e));
//   }
// };
//
// jukiQuizBot.command('newQuiz', async (ctx) => {
//   if (ctx.chat.type === 'private') {
//     logMessage(LogLevel.INFO)(ctx.message);
//     const quizId = v4();
//     quizzes[quizId] = {
//       id: quizId,
//       title: '',
//       timestamp: Date.now(),
//       questions: [],
//       messages: [],
//       ownerId: ctx.message.from.id,
//       closed: false,
//       publicAnswers: false,
//     };
//     const userId = ctx.message.from.id;
//     const chatId = ctx.chat.id;
//     const message = await ctx.reply(...getQuizText(quizzes[quizId], userId, chatId));
//     quizzes[quizId].messages.push({ id: message.message_id, chatId, userId });
//     return message;
//   }
//   return ctx.reply('lo siento, para crear un quiz debes escribirme en privado :)');
// });
//
// jukiQuizBot.command('startQuiz', async (ctx) => {
//   const message = await ctx.reply(...getQuizzesText(ctx.message.from.id));
//   return message;
// });
//
// const EMPTY_SESSION: SessionData = { quizId: '', lastMessage: { chatId: '', id: -1 } };
//
// const updateOnActionMessageKeyboard = async (ctx: MyContext, quiz: Quiz, text: string, buttons: KeyboardButton[][]) => {
//   try {
//     if (ctx.session?.lastMessage && ctx.session.lastMessage.chatId) {
//       ctx.telegram.deleteMessage(ctx.session.lastMessage.chatId, ctx.session.lastMessage.id).catch(e => console.error('e: ', e));
//     }
//     const message = await ctx.reply(text, Markup.keyboard(buttons).oneTime().resize());
//     const quizId = quiz.id;
//     ctx.session = EMPTY_SESSION;
//     ctx.session.quizId = quizId;
//     ctx.session.lastMessage = { chatId: ctx.chat?.id.toString() || '', id: message.message_id };
//     return message;
//   } catch (e) {
//     console.error('e: ', e);
//   }
// };
//
// type ActionContext = NarrowedContext<MyContext & { match: RegExpExecArray }, Update.CallbackQueryUpdate<CallbackQuery>>;
//
// const action = (callback: (ctx: ActionContext, quiz: Quiz, props: {
//   userId: number,
//   chatId: number,
// }) => Promise<void>) => async (ctx: ActionContext) => {
//   const data = ctx.match.input?.split(':');
//   const quizId = data[1];
//   const quiz = quizzes[quizId];
//   if (quiz) {
//     try {
//       const userId = ctx.update.callback_query.from?.id || NaN;
//       const chatId = ctx.chat?.id || NaN;
//       return await callback(ctx, quiz, { userId, chatId });
//     } catch (e) {
//       console.error('e: ', e);
//     }
//   }
//   return ctx.reply('Cuestionario no encontrado').catch(e => console.error('e: ', e));
// };
//
// jukiQuizBot.action(/^edit\-quiz/, action(async (ctx, quiz, { userId }) => {
//   if (ctx.chat?.type === 'private') {
//     await updateOnActionMessageKeyboard(ctx, quiz, '¿Qué quieres editar?', getQuizEditKeyboardButtons(quiz));
//     return;
//   }
//   const message = await ctx.telegram.sendMessage(userId, ...getQuizText(quiz, userId, userId));
//   quiz.messages.push({ id: message.message_id, chatId: userId, userId });
//   await ctx.answerCbQuery('Edita en privado con el bot');
// }));
//
// jukiQuizBot.action(/^answer\-quiz/, action(async (ctx, quiz, { userId }) => {
//   if (ctx.chat?.type === 'private') {
//     if (quiz.questions.length) {
//       await updateOnActionMessageKeyboard(ctx, quiz, '¿Qué pregunta quires responser?', getQuizAnswerKeyboardButtons(quiz));
//     } else {
//       await ctx.answerCbQuery('El cuestionario no tiene preguntas');
//     }
//     return;
//   }
//   const message = await ctx.telegram.sendMessage(userId, ...getQuizText(quiz, userId, userId));
//   quiz.messages.push({ id: message.message_id, chatId: userId, userId });
//   await ctx.answerCbQuery('Responde en privado con el bot, si aún no hablaste con @JukiQuizBot, escribele y vuelve a intentar');
// }));
//
// jukiQuizBot.action(/^start\-quiz/, action(async (ctx, quiz, { userId, chatId }) => {
//   const message = await ctx.reply(...getQuizText(quiz, userId, chatId));
//   quiz.messages.push({ id: message.message_id, chatId, userId });
// }));
//
// jukiQuizBot.action(/^open\-quiz/, action(async (ctx, quiz, { userId }) => {
//   quiz.closed = false;
//   updateQuiz(ctx, quiz);
// }));
//
// jukiQuizBot.action(/^close\-quiz/, action(async (ctx, quiz, { userId }) => {
//   quiz.closed = true;
//   updateQuiz(ctx, quiz);
// }));
//
// jukiQuizBot.action(/^show\-answers\-quiz/, action(async (ctx, quiz, { userId }) => {
//   quiz.publicAnswers = true;
//   updateQuiz(ctx, quiz);
// }));
//
// jukiQuizBot.action(/^hide\-answers\-quiz/, action(async (ctx, quiz, { userId }) => {
//   quiz.publicAnswers = false;
//   updateQuiz(ctx, quiz);
// }));
//
// jukiQuizBot.on('message', async (ctx) => {
//   if (ctx.session?.quizId && (ctx.message as any).web_app_data?.data) {
//     const quizId = ctx.session.quizId;
//     const quiz = quizzes[quizId];
//     const data = JSON.parse((ctx.message as any).web_app_data.data);
//     const buttonText: string = (ctx.message as any).web_app_data.button_text;
//
//     if (buttonText === BUTTON_TEXT_TITLE) {
//       quiz.title = data.value;
//       updateQuiz(ctx, quiz);
//     } else if (buttonText === BUTTON_TEXT_ADD_QUESTION) {
//       quiz.questions = [
//         ...quiz.questions,
//         { question: data.value, answers: {} },
//       ];
//       updateQuiz(ctx, quiz);
//     } else if (buttonText.indexOf(BUTTON_TEXT_QUESTION) === 0) {
//       const index = +buttonText.replace(BUTTON_TEXT_QUESTION, '') - 1;
//       if (!quiz.questions[index]) {
//         return ctx.reply('Pregunta no encontrada').catch(e => console.error('e: ', e));
//       }
//       quiz.questions[index] = { ...quiz.questions[index], question: data.value };
//       updateQuiz(ctx, quiz);
//     } else if (buttonText.indexOf(BUTTON_TEXT_ANSWER) === 0) {
//       const index = +buttonText.replace(BUTTON_TEXT_ANSWER, '') - 1;
//       if (!quiz.questions[index]) {
//         return ctx.reply('Pregunta no encontrada').catch(e => console.error('e: ', e));
//       }
//       console.info(ctx.message.from);
//       quiz.questions[index] = {
//         ...quiz.questions[index],
//         answers: {
//           ...quiz.questions[index]?.answers,
//           [ctx.message.from?.id]: {
//             timestamp: data.timestamp,
//             answer: data.value,
//             userId: ctx.message.from?.id,
//             username: ctx.message.from?.username || (ctx.message.from?.first_name + ' ' + ctx.message.from?.last_name),
//           },
//         },
//       };
//       updateQuiz(ctx, quiz);
//     }
//     ctx.telegram.deleteMessage(ctx.chat.id.toString(), ctx.message.message_id).catch(e => console.error('e: ', e));
//     ctx.telegram.deleteMessage(ctx.session.lastMessage.chatId, ctx.session.lastMessage.id).catch(e => console.error('e: ', e));
//   } else {
//     console.info('message > ', ctx, ctx.chat, ctx.update);
//   }
// });
//
// jukiQuizBot.action(/.+/, (ctx) => {
//   console.info('all', ctx);
//   return ctx.answerCbQuery(`Oh, ${ctx.match[0]}! Great choice`);
// });
//
// // Enable graceful stop
// process.once('SIGINT', () => jukiQuizBot.stop('SIGINT'));
// process.once('SIGTERM', () => jukiQuizBot.stop('SIGTERM'));

export const jukiQuizBot: any = null;
