import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const ensureDirectory = (dir) => {
  if (!dir) {
    throw new Error('Upload directory must be provided');
  }

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const readRequestBuffer = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });

const readRequestBody = async (req) => {
  const buffer = await readRequestBuffer(req);
  return buffer.toString('utf8');
};

const parseJson = async (req) => {
  try {
    const raw = await readRequestBody(req);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw);
  } catch (error) {
    error.status = 400;
    error.message = 'Invalid JSON payload';
    throw error;
  }
};

const parseUrlEncoded = async (req) => {
  const raw = await readRequestBody(req);
  if (!raw) {
    return {};
  }
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
};

const shouldParseBody = (req) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return false;
  }

  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return false;
  }

  return true;
};

const isMultipart = (req) => {
  const contentType = req.headers['content-type'] || '';
  return contentType.toLowerCase().startsWith('multipart/form-data');
};

const isJson = (req) => {
  const contentType = req.headers['content-type'] || '';
  return contentType.includes('application/json');
};

const isUrlEncoded = (req) => {
  const contentType = req.headers['content-type'] || '';
  return contentType.includes('application/x-www-form-urlencoded');
};

const canAccessRawBody = (req) => {
  if (typeof req.readableEnded === 'boolean') {
    return !req.readableEnded;
  }

  if (typeof req.complete === 'boolean') {
    return !req.complete;
  }

  return true;
};

const parseContentDisposition = (value = '') => {
  const result = {};
  const parts = value.split(';').map((part) => part.trim());
  for (const part of parts) {
    if (!part) {
      continue;
    }

    const [key, rawVal] = part.split('=');
    if (typeof rawVal === 'undefined') {
      continue;
    }

    const cleanedKey = key.toLowerCase();
    const cleanedVal = rawVal?.trim().replace(/^"|"$/g, '') ?? '';
    result[cleanedKey] = cleanedVal;
  }

  return result;
};

const parseMultipart = async (req, { uploadDir, fileField, limits }) => {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);
  const boundaryKey = boundaryMatch?.[1] || boundaryMatch?.[2];

  if (!boundaryKey) {
    const error = new Error('Multipart boundary missing');
    error.status = 400;
    throw error;
  }

  ensureDirectory(uploadDir);

  const rawBuffer = await readRequestBuffer(req);
  const rawString = rawBuffer.toString('binary');
  const boundary = `--${boundaryKey}`;

  const segments = rawString.split(boundary).slice(1);
  const body = {};
  const files = [];
  let fieldCount = 0;

  for (let segment of segments) {
    if (!segment || segment === '--' || segment === '--\r\n') {
      continue;
    }

    if (segment.startsWith('\r\n')) {
      segment = segment.slice(2);
    }

    if (segment.endsWith('--')) {
      segment = segment.slice(0, -2);
    }

    if (segment.endsWith('\r\n')) {
      segment = segment.slice(0, -2);
    }

    const headerSplitIndex = segment.indexOf('\r\n\r\n');
    if (headerSplitIndex === -1) {
      continue;
    }

    const rawHeaders = segment.slice(0, headerSplitIndex);
    const rawBody = segment.slice(headerSplitIndex + 4);

    const headerLines = rawHeaders.split('\r\n').filter(Boolean);
    const headers = {};
    for (const line of headerLines) {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) {
        continue;
      }
      const key = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();
      headers[key] = value;
    }

    const disposition = parseContentDisposition(headers['content-disposition']);
    const fieldName = disposition.name;

    if (!fieldName) {
      continue;
    }

    const bodyBuffer = Buffer.from(rawBody, 'binary');

    if (disposition.filename) {
      if (typeof limits?.files === 'number' && files.length >= limits.files) {
        const error = new Error('Too many files uploaded');
        error.status = 413;
        throw error;
      }

      if (typeof limits?.parts === 'number' && fieldCount + files.length + 1 > limits.parts) {
        const error = new Error('Too many form parts');
        error.status = 413;
        throw error;
      }

      const originalname = disposition.filename;
      if (!originalname) {
        continue;
      }

      const fileBuffer = bodyBuffer;
      const size = fileBuffer.length;

      if (limits?.fileSize && size > limits.fileSize) {
        const error = new Error('Uploaded file exceeds size limit');
        error.status = 413;
        throw error;
      }

      const extension = path.extname(originalname) || '';
      const filename = `${randomUUID()}${extension}`;
      const storedPath = path.join(uploadDir, filename);

      await new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(storedPath);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
        writeStream.end(fileBuffer);
      });

      const file = {
        fieldname: fieldName,
        originalname,
        encoding: headers['content-transfer-encoding'] || '7bit',
        mimetype: headers['content-type'] || 'application/octet-stream',
        destination: uploadDir,
        filename,
        path: storedPath,
        size
      };

      files.push(file);
    } else {
      fieldCount += 1;

      if (typeof limits?.fields === 'number' && fieldCount > limits.fields) {
        const error = new Error('Too many form fields');
        error.status = 413;
        throw error;
      }

      if (typeof limits?.parts === 'number' && fieldCount + files.length > limits.parts) {
        const error = new Error('Too many form parts');
        error.status = 413;
        throw error;
      }

      if (limits?.fieldSize && bodyBuffer.length > limits.fieldSize) {
        const error = new Error('Form field size exceeds limit');
        error.status = 413;
        throw error;
      }

      const value = bodyBuffer.toString('utf8');
      if (Object.prototype.hasOwnProperty.call(body, fieldName)) {
        if (Array.isArray(body[fieldName])) {
          body[fieldName].push(value);
        } else {
          body[fieldName] = [body[fieldName], value];
        }
      } else {
        body[fieldName] = value;
      }
    }
  }

  const primaryFile = files.find((file) => file.fieldname === fileField) || files[0];
  if (primaryFile) {
    req.file = primaryFile;
  }
  req.files = files;

  return body;
};

export default (conf = {}) => {
  const { uploadDir = path.join(process.cwd(), 'uploads'), limits, fileField = 'file' } = conf;

  ensureDirectory(uploadDir);

  return async (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      req.body = {};
    }

    if (!Array.isArray(req.files)) {
      req.files = [];
    }

    if (typeof req.file !== 'undefined') {
      delete req.file;
    }

    if (!shouldParseBody(req)) {
      return next();
    }

    if (isMultipart(req)) {
      try {
        const parsedBody = await parseMultipart(req, { uploadDir, fileField, limits });
        req.body = { ...req.body, ...parsedBody };
      } catch (error) {
        return next(error);
      }
      return next();
    }

    try {
      if (isJson(req) && canAccessRawBody(req)) {
        req.body = await parseJson(req);
      } else if (isUrlEncoded(req) && canAccessRawBody(req)) {
        req.body = await parseUrlEncoded(req);
      }
    } catch (error) {
      return next(error);
    }

    return next();
  };
};
