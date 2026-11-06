import { serviceHost, serviceName } from '../src/discovery/mdns';

describe('mDNS helpers', () => {
  it('prefers the IPv4 address', () => {
    expect(serviceHost({ ipv4: ['192.168.1.20'], addresses: ['fe80::1', '192.168.1.20'] })).toBe('192.168.1.20');
    expect(serviceHost({ addresses: ['fe80::1', '10.0.0.5'] })).toBe('10.0.0.5');
    expect(serviceHost({ addresses: ['fe80::1'] })).toBeNull();
  });

  it('uses the friendly name of a Chromecast', () => {
    expect(serviceName('googlecast', { name: 'Chromecast-1a2b3c', txt: { fn: 'Phòng khách' } })).toBe('Phòng khách');
    expect(serviceName('googlecast', { name: 'Chromecast-1a2b3c', txt: {} })).toBe('Chromecast-1a2b3c');
  });

  it('drops the [LG] tag from AirPlay names', () => {
    expect(serviceName('airplay', { name: '[LG] webOS TV OLED55C1PVB' })).toBe('webOS TV OLED55C1PVB');
    expect(serviceName('airplay', { name: '' })).toBeNull();
  });
});
