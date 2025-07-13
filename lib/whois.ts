import net from 'net';

/**
 * Performs a WHOIS lookup for a given domain.
 * @param domain Domain name to query.
 * @param server WHOIS server to use. Defaults to Verisign's server.
 * @returns Promise that resolves with the raw WHOIS response.
 */
export function lookupWhois(domain: string, server: string = 'whois.verisign-grs.com'): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';

    const socket = net.createConnection(43, server, () => {
      socket.write(domain + '\r\n');
    });

    socket.setEncoding('utf-8');

    socket.on('data', chunk => {
      data += chunk;
    });

    socket.on('end', () => {
      resolve(data);
    });

    socket.on('error', err => {
      reject(err);
    });
  });
}
