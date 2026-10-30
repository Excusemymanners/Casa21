# 🚀 OVERVIEW APP - SETUP PENTRU CLIENT

## Varianta recomandată

1. Clonează repository-ul din GitHub pe calculatorul tău.
2. Intră în folderul proiectului.
3. Rulează scriptul potrivit sistemului:
   - Linux: `./CREATE-SHORTCUT.sh`
   - Windows: `CREATE-SHORTCUT.bat`

## Pe Linux

1. Deschide shortcut-ul `Overview.desktop` de pe Desktop.
2. La prima pornire, aplicația instalează dependențele lipsă, construiește interfața și pornește automat.
3. Dacă nu ai Node.js sau Docker, instalează-le o singură dată.

## Pe Windows

1. Asigură-te că ai instalat Docker Desktop și Node.js 22.x.
2. Deschide folderul proiectului.
3. Dublu-click pe **CREATE-SHORTCUT.bat**.
4. Gata: vei vedea shortcut-ul **Overview** pe Desktop.
5. Dublu-click pe shortcut și aplicația pornește automat.

## 🔑 Login Implicit
```
Username: admin
Password: admin
```

## ⚙️ Prerequisite-uri

- **Node.js 22.x**
- **Docker**

## 🎯 Ce se Întâmplă Când dai Click pe Shortcut?

1. ✅ Aplicația se pornește
2. ✅ Dacă lipsesc dependențe, ele sunt instalate automat
3. ✅ Dacă lipsește build-ul, acesta se generează automat
4. ✅ Baza de date pornește prin Docker
5. ✅ Fereastra aplicației se deschide direct

**Doar click și gata.**

## 🆘 Probleme?

### "Docker not found"
- Instalează Docker Desktop: https://www.docker.com

### App se deschide gol (alb)
- Asteaptă 10-15 secunde, se încarcă din spate
- Dacă nu se încarcă, verifica dacă Docker rulează

### Port 3000 deja folosit
- Verifica dacă alt app rulează pe port 3000
- SAU: Deschide Task Manager și ucide procesul "node"

### Pe alte calculatoare: "This site can't be reached" / "took too long to respond"
- Windows Firewall de pe PC-ul cu aplicația blochează portul 3000
- Rulează `ALLOW-FIREWALL.bat` (cere singur drepturi de Administrator) — deschide portul 3000 pe toate profilurile de rețea
- `RUN-APP-LOCAL.bat` verifică singur regula la fiecare pornire și o creează dacă lipsește

## 📱 Acces de pe Telefon/Tablă

Pe același WiFi:
1. Gaseste IP-ul computerului:
   - Start → CMD → `ipconfig` → caută "IPv4 Address"
   - Ex: 192.168.1.100
2. Pe telefon: deschide browser, introdu `http://192.168.1.100:3000`
3. SAU: Scanează QR codul din login screen

## 💾 Datele Tale

- Baza de date se salveaza automat în Docker
- Datele persista între redeschideri
- Nu trebuie să faci nimic - totul e automat

---

**DOAR CLICK ȘI GATA! 🎉**
