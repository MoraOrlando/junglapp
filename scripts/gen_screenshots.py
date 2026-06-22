#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1242, 2688
OUT = "/home/user/junglapp/docs/appstore"
os.makedirs(OUT, exist_ok=True)

FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

DARK = (29, 84, 63)
MID = (45, 106, 79)
LIGHT = (149, 213, 109)
LIGHT2 = (200, 240, 170)
WHITE = (255, 255, 255)
CARD = (255, 255, 255)
GREYTXT = (100, 116, 139)
INK = (30, 41, 59)
BLUE = (37, 99, 235)

def font(path, size):
    return ImageFont.truetype(path, size)

def vgradient(draw, x0, y0, x1, y1, c0, c1):
    h = y1 - y0
    for i in range(h):
        t = i / max(1, h - 1)
        r = int(c0[0] + (c1[0] - c0[0]) * t)
        g = int(c0[1] + (c1[1] - c0[1]) * t)
        b = int(c0[2] + (c1[2] - c0[2]) * t)
        draw.line([(x0, y0 + i), (x1, y0 + i)], fill=(r, g, b))

def center_text(draw, cx, y, text, fnt, fill):
    bbox = draw.textbbox((0, 0), text, font=fnt)
    w = bbox[2] - bbox[0]
    draw.text((cx - w / 2, y), text, font=fnt, fill=fill)
    return bbox[3] - bbox[1]

def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)

def paw(draw, cx, cy, scale, color):
    # central pad
    draw.ellipse([cx-26*scale, cy-6*scale, cx+26*scale, cy+34*scale], fill=color)
    # toes
    offs = [(-34,-20,16,24),(-13,-34,15,26),(13,-34,15,26),(34,-20,16,24)]
    for ox, oy, rx, ry in offs:
        draw.ellipse([cx+ox*scale-rx*scale, cy+oy*scale-ry*scale,
                      cx+ox*scale+rx*scale, cy+oy*scale+ry*scale], fill=color)

def make(filename, headline, subline, builder):
    img = Image.new("RGB", (W, H), DARK)
    d = ImageDraw.Draw(img)
    vgradient(d, 0, 0, W, H, MID, DARK)

    # Headline
    fh = font(FB, 78)
    fs = font(FR, 44)
    y = 150
    # wrap headline into up to 2 lines
    words = headline.split()
    lines, cur = [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if d.textbbox((0,0), test, font=fh)[2] > W - 160 and cur:
            lines.append(cur); cur = w
        else:
            cur = test
    lines.append(cur)
    for ln in lines:
        center_text(d, W/2, y, ln, fh, WHITE)
        y += 96
    y += 20
    center_text(d, W/2, y, subline, fs, LIGHT2)

    # Phone frame
    pw, ph = 880, 1560
    px = (W - pw) // 2
    py = 760
    rounded(d, [px-14, py-14, px+pw+14, py+ph+14], 90, (15, 50, 38))
    rounded(d, [px, py, px+pw, py+ph], 76, (248, 250, 252))
    # status bar notch
    rounded(d, [px+pw/2-90, py+30, px+pw/2+90, py+62], 16, (15,50,38))

    builder(d, px, py, pw, ph)

    img.save(os.path.join(OUT, filename), "PNG")
    print("saved", filename)

# ---- Screen 1: Pet health profile ----
def screen1(d, px, py, pw, ph):
    cx = px + pw/2
    # header
    d.text((px+50, py+110), "Mis Mascotas", font=font(FB,52), fill=INK)
    paw(d, px+pw-90, py+135, 0.9, LIGHT)
    # pet card
    cardx0, cardy0 = px+50, py+220
    cardx1, cardy1 = px+pw-50, py+620
    rounded(d, [cardx0, cardy0, cardx1, cardy1], 40, CARD)
    d.rounded_rectangle([cardx0, cardy0, cardx1, cardy1], radius=40, outline=(226,232,240), width=2)
    # avatar circle
    d.ellipse([cardx0+40, cardy0+50, cardx0+200, cardy0+210], fill=LIGHT2)
    paw(d, cardx0+120, cardy0+125, 1.0, MID)
    d.text((cardx0+230, cardy0+70), "Rocky", font=font(FB,56), fill=INK)
    d.text((cardx0+230, cardy0+145), "Golden Retriever · 3 anos", font=font(FR,36), fill=GREYTXT)
    # health row chips
    chips = [("Vacunas", LIGHT), ("Al dia", (34,197,94))]
    chx = cardx0+40
    for label, col in chips:
        w = d.textbbox((0,0), label, font=font(FB,34))[2] + 60
        rounded(d, [chx, cardy0+250, chx+w, cardy0+320], 35, (240,253,244))
        d.text((chx+30, cardy0+262), label, font=font(FB,34), fill=(22,101,52))
        chx += w + 24
    # reminder banner
    by0 = cardy1 + 40
    rounded(d, [px+50, by0, px+pw-50, by0+150], 36, (239,246,255))
    d.text((px+90, by0+35), "Proximo control", font=font(FB,40), fill=BLUE)
    d.text((px+90, by0+90), "Vacuna antirrabica - 15 jul", font=font(FR,34), fill=(71,85,105))
    # second pet card mini
    my0 = by0+200
    rounded(d, [px+50, my0, px+pw-50, my0+220], 40, CARD)
    d.rounded_rectangle([px+50, my0, px+pw-50, my0+220], radius=40, outline=(226,232,240), width=2)
    d.ellipse([px+90, my0+40, px+90+140, my0+180], fill=(254,226,226))
    paw(d, px+160, my0+110, 0.85, (239,68,68))
    d.text((px+260, my0+55), "Luna", font=font(FB,52), fill=INK)
    d.text((px+260, my0+125), "Gato Siames · 2 anos", font=font(FR,34), fill=GREYTXT)

# ---- Screen 2: Find vets nearby ----
def screen2(d, px, py, pw, ph):
    d.text((px+50, py+110), "Veterinarios", font=font(FB,52), fill=INK)
    paw(d, px+pw-90, py+135, 0.9, LIGHT)
    yy = py+220
    vets = [("Dra. Carolina Soto","Clinica VidaPet · 1.2 km","4.9","$25.000"),
            ("Dr. Andres Rojas","PetCare Centro · 2.0 km","4.8","$22.000"),
            ("Dra. Maria Fuentes","AnimalSalud · 3.4 km","5.0","$28.000")]
    for name, sub, rate, price in vets:
        rounded(d, [px+50, yy, px+pw-50, yy+330], 40, CARD)
        d.rounded_rectangle([px+50, yy, px+pw-50, yy+330], radius=40, outline=(226,232,240), width=2)
        d.ellipse([px+90, yy+50, px+90+150, yy+200], fill=LIGHT2)
        paw(d, px+165, yy+125, 0.9, MID)
        d.text((px+270, yy+55), name, font=font(FB,46), fill=INK)
        d.text((px+270, yy+120), sub, font=font(FR,34), fill=GREYTXT)
        # star rating
        d.text((px+270, yy+175), "* " + rate, font=font(FB,38), fill=(234,179,8))
        # price chip
        rounded(d, [px+pw-280, yy+170, px+pw-90, yy+250], 35, (240,253,244))
        d.text((px+pw-255, yy+185), price, font=font(FB,36), fill=(22,101,52))
        # book button
        rounded(d, [px+90, yy+235, px+pw-90, yy+305], 35, BLUE)
        center_text(d, px+pw/2, yy+250, "Agendar cita", font(FB,38), WHITE)
        yy += 380

# ---- Screen 3: Calendar / availability ----
def screen3(d, px, py, pw, ph):
    d.text((px+50, py+110), "Agenda tu cita", font=font(FB,52), fill=INK)
    paw(d, px+pw-90, py+135, 0.9, LIGHT)
    # day strip
    yy = py+230
    days = [("Lun","14"),("Mar","15"),("Mie","16"),("Jue","17")]
    dw = (pw-100)//4
    for i,(dn,num) in enumerate(days):
        x0 = px+50 + i*dw + 10
        sel = i==1
        col = BLUE if sel else CARD
        rounded(d, [x0, yy, x0+dw-20, yy+170], 30, col)
        if not sel:
            d.rounded_rectangle([x0, yy, x0+dw-20, yy+170], radius=30, outline=(226,232,240), width=2)
        center_text(d, x0+(dw-20)/2, yy+30, dn, font(FR,32), LIGHT2 if sel else GREYTXT)
        center_text(d, x0+(dw-20)/2, yy+75, num, font(FB,52), WHITE if sel else INK)
    # time slots grid
    yy += 240
    d.text((px+50, yy), "Horarios disponibles", font=font(FB,40), fill=INK)
    yy += 80
    slots = ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","15:00","15:30","16:00","16:30"]
    cols = 3
    sw = (pw-100)//cols
    for i, s in enumerate(slots):
        r = i//cols; c = i%cols
        x0 = px+50 + c*sw + 8
        y0 = yy + r*110
        avail = i not in (1,4,7)
        col = (220,252,231) if avail else (248,250,252)
        bc = (22,163,74) if avail else (226,232,240)
        rounded(d, [x0, y0, x0+sw-16, y0+90], 24, col)
        d.rounded_rectangle([x0, y0, x0+sw-16, y0+90], radius=24, outline=bc, width=2)
        center_text(d, x0+(sw-16)/2, y0+24, s, font(FB,38), (22,101,52) if avail else (148,163,184))
    # confirm button
    by = yy + 4*110 + 30
    rounded(d, [px+50, by, px+pw-50, by+110], 36, MID)
    center_text(d, px+pw/2, by+30, "Confirmar reserva", font(FB,46), WHITE)

# ---- Screen 4: Community / lost pets ----
def screen4(d, px, py, pw, ph):
    d.text((px+50, py+110), "Comunidad", font=font(FB,52), fill=INK)
    paw(d, px+pw-90, py+135, 0.9, LIGHT)
    # lost pet alert
    yy = py+220
    rounded(d, [px+50, yy, px+pw-50, yy+360], 40, (254,242,242))
    d.rounded_rectangle([px+50, yy, px+pw-50, yy+360], radius=40, outline=(254,202,202), width=2)
    rounded(d, [px+90, yy+40, px+90+200, yy+240], 30, (254,226,226))
    paw(d, px+190, yy+140, 1.2, (239,68,68))
    d.text((px+320, yy+55), "Se busca", font=font(FB,44), fill=(220,38,38))
    d.text((px+320, yy+120), "Max - Labrador negro", font=font(FR,36), fill=(71,85,105))
    d.text((px+320, yy+170), "Visto en Providencia", font=font(FR,32), fill=GREYTXT)
    rounded(d, [px+320, yy+230, px+pw-100, yy+300], 32, (239,68,68))
    center_text(d, (px+320+px+pw-100)/2, yy+245, "Vi a este animal", font(FB,34), WHITE)
    # match / connect card
    yy += 410
    rounded(d, [px+50, yy, px+pw-50, yy+330], 40, CARD)
    d.rounded_rectangle([px+50, yy, px+pw-50, yy+330], radius=40, outline=(226,232,240), width=2)
    d.text((px+90, yy+40), "Conecta con otros duenos", font=font(FB,42), fill=INK)
    d.text((px+90, yy+105), "Encuentra companeros de juego", font=font(FR,34), fill=GREYTXT)
    # two avatars + heart
    d.ellipse([px+120, yy+160, px+120+130, yy+290], fill=LIGHT2)
    paw(d, px+185, yy+225, 0.8, MID)
    d.ellipse([px+pw-250, yy+160, px+pw-120, yy+290], fill=(254,226,226))
    paw(d, px+pw-185, yy+225, 0.8, (239,68,68))
    center_text(d, px+pw/2, yy+200, "<3", font(FB,70), (239,68,68))
    # chat button
    by = yy+380
    rounded(d, [px+50, by, px+pw-50, by+110], 36, BLUE)
    center_text(d, px+pw/2, by+30, "Abrir chat seguro", font(FB,46), WHITE)

make("01_salud.png", "Toda la salud de tu mascota", "En un solo lugar, siempre contigo", screen1)
make("02_veterinarios.png", "Veterinarios cerca de ti", "Encuentra y reserva en segundos", screen2)
make("03_agenda.png", "Agenda citas al instante", "Disponibilidad real, sin llamadas", screen3)
make("04_comunidad.png", "Una comunidad que protege", "Cuida, conecta y ayuda a otros", screen4)
print("DONE")
