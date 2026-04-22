import { JUKI_SECRET_TOKEN, NODE_ENV, VERSION } from 'config/settings';
import fs from 'fs';
import { toJkError } from 'helpers';
import os from 'os';
import { ErrorCode, JkError, JkResponse, Request } from 'types';

export function routerGetPing(request: Request, response: JkResponse) {
  try {
    response.sendContent('pong');
  } catch (error) {
    response.sendError(toJkError(error), { message: 'Error handling "routerGetPing"', notify: true });
  }
}

export function routerGetVersion(request: Request, response: JkResponse) {
  try {
    response.sendContent(VERSION);
  } catch (error) {
    response.sendError(toJkError(error), { message: 'Error handling "routerGetVersion"', notify: true });
  }
}

export function routerGetNodeEnv(request: Request, response: JkResponse) {
  try {
    response.sendContent(NODE_ENV);
  } catch (error) {
    response.sendError(toJkError(error), { message: 'Error handling "routerGetEnv"', notify: true });
  }
}

export function routerGetStatus(request: Request, response: JkResponse) {
  try {
    response.sendContent({
      time: new Date(),
      cpus: os.cpus(),
      totalmem: os.totalmem(),
      freemem: os.freemem(),
    });
  } catch (error) {
    response.sendError(toJkError(error), { message: 'Error handling "routerGetStatus"', notify: true });
  }
}

export function routerGetLsFolderPath(request: Request<{ folderPath: string }>, response: JkResponse) {
  try {
    if (request.query.secretToken !== JUKI_SECRET_TOKEN) {
      return response.sendError(new JkError(ErrorCode.ERR401), {
        message: `Unauthorized "routerGetLsFolderPath", folderPath: "${request.params.folderPath}"`,
        notify: true,
      });
    }
    const files = fs.readdirSync(request.params.folderPath, { withFileTypes: true });
    
    const result = files.map((file) =>
      file.isDirectory()
        ? ({ name: file.name, type: 'directory' })
        : (file.isFile()) ? ({ name: file.name, type: 'file' })
          : ({ name: file.name, type: 'unknown' }),
    );
    
    response.sendContent(result);
  } catch (error) {
    response.sendError(toJkError(error), {
      message: `Error handling "routerGetLsFolderPath", folderPath: "${request.params.folderPath}"`,
      notify: true,
    });
  }
}

export function routerGetCatFilePath(request: Request<{ filePath: string }>, response: JkResponse) {
  try {
    if (request.query.secretToken !== JUKI_SECRET_TOKEN) {
      return response.sendError(new JkError(ErrorCode.ERR401), {
        message: `Unauthorized "routerGetCatFilePath", filePath: "${request.params.filePath}"`,
        notify: true,
      });
    }
    response.sendContent(fs.readFileSync(request.params.filePath, 'utf8'));
  } catch (error) {
    response.sendError(toJkError(error), {
      message: `Error handling "routerGetCatFilePath", filePath: "${request.params.filePath}"`,
      notify: true,
    });
  }
}

export function routerGetEnvs(request: Request, response: JkResponse) {
  try {
    if (request.query.secretToken !== JUKI_SECRET_TOKEN) {
      return response.sendError(new JkError(ErrorCode.ERR401), {
        message: 'Unauthorized "routerGetEnvs"',
        notify: true,
      });
    }
    response.sendContent({
      ...process.env,
    });
  } catch (error) {
    response.sendError(toJkError(error), {
      message: 'Error handling "routerGetEnvs"',
      notify: true,
    });
  }
}
