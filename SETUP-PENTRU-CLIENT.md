# 🚀 OVERVIEW APP - SETUP PENTRU CLIENT

## Pentru Client (Pași Simpli)

### Pasul 1: Descarcă și Extrage
1. Descarcă `Overview-App-Windows.zip`
2. Extrage cu clic dreapta → "Extract All"

### Pasul 2: Crează Shortcut pe Desktop
1. Deschide folderul extras
2. Dublu-click pe **CREATE-SHORTCUT.bat**
3. Gata! Vei vedea mesajul "Shortcut created successfully"

### Pasul 3: Folosește Aplicația
1. Mergi pe Desktop
2. Dublu-click pe icoana **Overview**
3. App-ul se deschide automat (5-10 secunde)
4. Bază de date se pornește singură
5. Frontend-ul se încarcă în browser

## 🔑 Login Implicit
```
Username: admin
Password: admin
```

## ⚙️ Prerequisite-uri pe Windows
Doar o dată la început:
- **Docker Desktop** - https://www.docker.com/products/docker-desktop
  - Instalează și asigură-te că rulează

## 🎯 Ce se Întâmplă Când dai Click pe Shortcut?

1. ✅ Aplicația se pornește
2. ✅ Docker pornește baza de date PostgreSQL
3. ✅ Backend-ul se conectează la bază
4. ✅ Frontend-ul se deschide în browser la http://localhost:3000
5. ✅ Gata - poți lucra!

**Nu trebuie să înțelegi cum funcționează - doar click și gata!**

## 🆘 Probleme?

### "Docker not found"
- Instalează Docker Desktop: https://www.docker.com

### App se deschide gol (alb)
- Asteaptă 10-15 secunde, se încarcă din spate
- Dacă nu se încarcă, verifica dacă Docker rulează

### Port 3000 deja folosit
- Verifica dacă alt app rulează pe port 3000
- SAU: Deschide Task Manager și ucide procesul "node"

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
