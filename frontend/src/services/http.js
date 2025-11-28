import axios from 'axios';

export const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

export function formatHttpError(error) {
  if (error.response) {
    return error.response.data?.error || error.response.statusText;
  }
  if (error.request) {
    return 'No response received from the server.';
  }
  return error.message;
}
