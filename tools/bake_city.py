"""Author and bake the Liberty City scene. Run from any directory with Python and Pillow."""
import base64
import gzip
import json
import math
import random
import struct
from collections import defaultdict
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RNG = random.Random(7711)
TILE = 128
tiles = []
emissions = []
layers = {}


def tile(name, color):
    image = Image.new("RGB", (TILE, TILE), color)
    layers[name] = len(tiles)
    tiles.append(image)
    emissions.append(Image.new('L',(TILE,TILE),0))
    return ImageDraw.Draw(image)


def lettering(size):
    for font in ("DejaVuSansCondensed-Bold.ttf", "Arial Narrow Bold.ttf", "Arial Bold.ttf"):
        try:
            return ImageFont.truetype(font, size)
        except OSError:
            pass
    return ImageFont.load_default(size=size)


def tileNoise(draw, count, palette, width=1):
    for _ in range(count):
        x, y = RNG.randrange(TILE), RNG.randrange(TILE)
        draw.line((x, y, x + RNG.randint(0, width), y), fill=RNG.choice(palette))


tile("flat", "#ffffff")
water = tile("water", "#6e8691")
tileNoise(water, 800, ["#82959c", "#879da5", "#657d8b", "#c1a89f"], 12)
road = tile("road", "#63616b")
tileNoise(road, 3500, ["#595963", "#74707a", "#696670", "#595a64"])
road.line([(15, 1), (21, 26), (15, 39), (23, 47)], fill="#56555d")
pave = tile("pave", "#c2afa0")
for i in (0, 64):
    pave.line((i, 0, i, 127), fill="#918989")
    pave.line((0, i, 127, i), fill="#968d8c")
tileNoise(pave, 450, ["#b8a89a", "#cbbbb0"])
grass = tile("grass", "#77835c")
tileNoise(grass, 2100, ["#829263", "#657a57", "#8b9367", "#727e4e"], 2)

for name, wall, stone, windows, glass in [
    ("umber", "#965e55", "#c98d77", 2, "#253745"),
    ("brick", "#ab755f", "#d0a188", 2, "#354151"),
    ("cream", "#c5a68d", "#e5c8a3", 3, "#3c5360"),
    ("slate", "#69717e", "#a8a6ac", 3, "#354558"),
    ("azure", "#536d7f", "#8c9aa8", 4, "#324f66"),
    ("deco", "#96867c", "#c3ad92", 3, "#364953"),
    ("factory", "#996d62", "#b8826e", 2, "#3d4750"),
]:
    d = tile(name, wall)
    mask = ImageDraw.Draw(emissions[-1])
    if name in ("brick", "umber", "factory"):
        for y in range(0, 128, 6):
            d.line((0, y, 127, y), fill=stone, width=1)
            for x in range((y // 6 % 2) * 8, 128, 16):
                d.line((x, y, x, y+5), fill=stone)
    for row in range(2):
        for col in range(windows):
            pitch = 128 / windows
            x, y = round(col*pitch+pitch*.16), row*64+8
            w = round(pitch*.67)
            d.rectangle((x-2,y-2,x+w+2,y+45),fill=stone)
            d.rectangle((x,y,x+w,y+42),fill=glass)
            bright = RNG.choice(["#e8bc87", "#a89e97", "#9ba5aa", "#708993", "#c39781"])
            d.polygon([(x+2,y+2),(x+w-1,y+2),(x+w-1,y+20),(x+2,y+31)], fill=bright)
            d.rectangle((x+2,y+33,x+w-1,y+40),fill=RNG.choice([glass, "#b59a86","#596671"]))
            d.line((x+w//2,y,x+w//2,y+42),fill=wall,width=2)
            d.line((x,y+22,x+w,y+22),fill=wall,width=2)
            glow = RNG.choice([0,0,34,70,118,188])
            mask.rectangle((x+2,y+2,x+w-2,y+40),fill=glow)
            mask.line((x+w//2,y,x+w//2,y+42),fill=0,width=2)
            mask.line((x,y+22,x+w,y+22),fill=0,width=2)
            d.rectangle((x-3,y+43,x+w+3,y+46),fill=stone)
    d.rectangle((0,124,127,127),fill=stone)

signs = [
    ("record", "CROWN", "RECORDS", "#482639", "#ffcc89"),
    ("diner", "DINER", "OPEN LATE", "#295b60", "#ffd4a0"),
    ("grocer", "MARKET", "FRESH  /  DAILY", "#545d44", "#f3deaa"),
    ("garage", "RED HOOK", "MOTOR WORKS", "#8b443b", "#ffdfaa"),
    ("cinema", "ORPHEUM", "MIDNIGHT SHOW", "#52405b", "#ffcf8b"),
    ("news", "LIBERTY", "NEWS STAND", "#3b5667", "#ffe7b9"),
    ("radio", "CROWN FM", "88.3  /  BROKER", "#cd624e", "#ffe5b2"),
    ("hotel", "HOTEL", "ALGONQUIN", "#314856", "#ffc993"),
    ("disco", "VELVET", "SOCIAL CLUB", "#753954", "#ffe1ba"),
    ("freight", "A. C. Y.", "FREIGHT DEPOT", "#3c5863", "#f6d79a"),
    ("terminal", "EAST", "RIVER FERRY", "#326157", "#e8e0ae"),
]
for name, title, sub, bg, fg in signs:
    d = tile(name, bg)
    # Painted type occupies a square tile mapped onto a wide sign face.
    d.rectangle((3,4,124,123), outline=fg, width=2)
    size = 27
    while d.textlength(title,font=lettering(size)) > 114:
        size -= 1
    d.text((64,55),title,font=lettering(size),anchor="mm",fill=fg,stroke_width=0)
    d.line((14,77,113,77),fill=fg,width=2)
    d.text((64,94),sub,font=lettering(11),anchor="mm",fill=fg)
    mask = ImageDraw.Draw(emissions[-1])
    mask.text((64,55),title,font=lettering(size),anchor="mm",fill=170)
    mask.text((64,94),sub,font=lettering(11),anchor="mm",fill=170)

chunks = defaultdict(bytearray)
models = {}
mesh = bytearray()
meta = {"land": [], "roads": [], "nodes": [], "blocks": [], "solids": [], "parked": [], "traffic": [], "people": [], "records": []}
shadow = Image.new("L", (1536,1536), 255)
shadowDraw = ImageDraw.Draw(shadow)
SHADOW_BOUNDS = 600
VERT = struct.Struct("<3h2h6B")


def rgb(color):
    return tuple(bytes.fromhex(color.lstrip("#")))


def shadowPoly(points, intensity=170):
    shadowDraw.polygon([((x+SHADOW_BOUNDS)*1536/(SHADOW_BOUNDS*2),(z+SHADOW_BOUNDS)*1536/(SHADOW_BOUNDS*2)) for x,z in points], fill=intensity)


def unit(v):
    n = math.sqrt(sum(t*t for t in v))
    return tuple(t/n for t in v) if n else (0,1,0)


def cross(a,b):
    return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])


def face(points, color, mat="flat", uv=None, paint=False, normal=None):
    a,b,c = points[:3]
    n = normal or unit(cross(tuple(b[i]-a[i] for i in range(3)),tuple(c[i]-a[i] for i in range(3))))
    light = max(0, n[0]*-.74+n[1]*.57+n[2]*-.35)
    tone = rgb(color)
    uv = uv or [(0,1),(1,1),(1,0),(0,0)]
    for j in ((0,1,2,0,2,3) if len(points)==4 else (0,1,2)):
        pos = points[j]
        shade = (.79+.21*light, .79+.17*light, .85+.09*light)
        if mat == "water": shade = (1,1,1)
        packed = [min(255,round(tone[i]*shade[i])) for i in range(3)]
        mesh.extend(VERT.pack(*(round(v*16) for v in pos),*(round(v*64) for v in uv[j]),*packed,layers[mat],int(paint),230 if color in ("#ffe3a3","#fff0bc","#ff6358","#f26672","#568ce9","#ffdd8e","#ffd09a") else 0))


def box(x, y, z, w, h, d, color, mat="flat", roof=None, paint=False, repeat=7):
    a,b = x-w/2,x+w/2
    c,e = z-d/2,z+d/2
    t=y+h
    for points,span,normal in [
        ([(b,y,c),(a,y,c),(a,t,c),(b,t,c)],w,(0,0,-1)),
        ([(a,y,e),(b,y,e),(b,t,e),(a,t,e)],w,(0,0,1)),
        ([(a,y,c),(a,y,e),(a,t,e),(a,t,c)],d,(-1,0,0)),
        ([(b,y,e),(b,y,c),(b,t,c),(b,t,e)],d,(1,0,0))]:
        face(points,color,mat,[(0,h/repeat),(span/repeat,h/repeat),(span/repeat,0),(0,0)],paint,normal)
    face([(a,t,c),(a,t,e),(b,t,e),(b,t,c)],roof or color,"flat",paint=paint,normal=(0,1,0))


def floor(x,z,w,d,color,mat="flat",y=0,repeat=6):
    a,b=x-w/2,x+w/2
    c,e=z-d/2,z+d/2
    face([(a,y,c),(a,y,e),(b,y,e),(b,y,c)],color,mat,[(0,0),(0,d/repeat),(w/repeat,d/repeat),(w/repeat,0)],normal=(0,1,0))


def tube(start,end,r1,r2,color,sides=7,paint=False):
    axis=unit(tuple(end[i]-start[i] for i in range(3)))
    right=unit(cross(axis,(1,0,0) if abs(axis[1])>.9 else (0,1,0)))
    front=cross(axis,right)
    def ring(p,r):
        return [tuple(p[k]+r*(math.cos(i*math.tau/sides)*right[k]+math.sin(i*math.tau/sides)*front[k]) for k in range(3)) for i in range(sides)]
    low,high=ring(start,r1),ring(end,r2)
    for i in range(sides):
        j=(i+1)%sides
        face([low[i],low[j],high[j],high[i]],color,paint=paint)
        if r2: face([high[i],high[j],end],color,paint=paint,normal=axis)


def chunk(x,z):
    global mesh
    mesh=chunks[(math.floor(x/72),math.floor(z/72))]


def obstacle(x,z,w,d,h):
    meta["solids"].append([round(x-w/2,2),round(z-d/2,2),round(x+w/2,2),round(z+d/2,2),round(h,2)])


def building(x,z,w,d,h,mat,style,shops=True):
    chunk(x,z)
    obstacle(x,z,w,d,h)
    box(x,.25,z,w,h,d,"#ffffff",mat,"#998681",repeat=8 if mat=="azure" else 8.5)
    box(x,h-.22,z,w+.45,.6,d+.45,"#b7a299")
    shadowPoly([(x-w/2,z-d/2),(x+w/2,z-d/2),(x+w/2+h*.65,z-d/2+h*.27),(x+w/2+h*.65,z+d/2+h*.27),(x-w/2+h*.65,z+d/2+h*.27),(x-w/2,z+d/2)])
    if style=="tower":
        tier=h*.17
        box(x,h+.35,z,w*.77,tier,d*.78,"#f6e5d6",mat,"#c3a89c")
        box(x,h+tier+.35,z,w*.49,tier*.55,d*.51,"#e2c6a2",mat)
        if h>75:
            tube((x,h+tier*1.55,z),(x,h+tier*1.55+10,z),w*.22,.7,"#c4ad91",8)
            tube((x,h+tier*1.55+9,z),(x,h+tier*1.55+20,z),.34,.09,"#9a8c84",5)
    elif style=="tank":
        tx=x+w*.19
        for dx in (-1.5,1.5):
            for dz in (-1.5,1.5):
                box(tx+dx,h+.3,z+dz,.32,2.6,.32,"#55474b")
        tube((tx,h+2.5,z),(tx,h+6.0,z),2.5,2.5,"#956c59",10)
        tube((tx,h+6,z),(tx,h+7.4,z),2.82,.12,"#5a5757",10)
        box(x-w*.24,h+.35,z+d*.2,2,1.4,3.2,"#9d9292")
    else:
        box(x-w*.2,h+.3,z,4.2,1.8,3.2,"#a39893")
    if shops:
        shop=RNG.choice(signs)[0] if shops is True else shops
        sy=.3
        box(x,sy,z,w+.24,3.5,d+.24,"#4a4d52")
        face([(x-w*.46,sy+.25,z-d/2-.14),(x+w*.46,sy+.25,z-d/2-.14),(x+w*.46,sy+2.65,z-d/2-.14),(x-w*.46,sy+2.65,z-d/2-.14)],"#eee2c7", "azure",[(0,1),(3,1),(3,.2),(0,.2)],normal=(0,0,-1))
        for side in (-1,1):
            zz=z+side*(d/2+.20)
            xa,xb=(x-w*.36,x+w*.36) if side==1 else (x+w*.36,x-w*.36)
            face([(xa,2.55,zz),(xb,2.55,zz),(xb,4.38,zz),(xa,4.38,zz)],"#ffffff",shop,normal=(0,0,side))
            box(x,2.32,z+side*(d/2+.38),w*.83,.20,.9,"#a96d66")


def tree(x,z,s=1):
    obstacle(x,z,.55*s,.55*s,3.2*s)
    box(x,.25,z,.55*s,3.2*s,.55*s,"#705a54")
    for dx,dy,dz,r in [(0,3.9,0,2.2),(-.8,4.5,.4,1.55),(.65,4.8,-.35,1.65)]:
        cx,cy,cz=x+dx*s,dy*s,z+dz*s
        tube((cx,cy-r*.70*s,cz),(cx,cy,cz),.28*s,r*s,"#78805b",7)
        tube((cx,cy,cz),(cx,cy+r*.9*s,cz),r*s,.12*s,"#879060",7)
    shadowPoly([(x-1,z-1),(x+4*s,z-1),(x+5*s,z+2*s),(x+2*s,z+3*s)],190)


def lamp(x,z,side):
    box(x,.1,z,.27,5.8,.27,"#58616b")
    box(x+side*.68,5.79,z,1.6,.17,.18,"#697079")
    box(x+side*1.38,5.67,z,.86,.17,.44,"#ffe3a3")


def landmarkBoard(x,z,label):
    chunk(x,z)
    for dx in (-4.2,4.2): box(x+dx,.25,z,.38,8,.5,"#655b5d")
    box(x,5.6,z,12,3.8,.45,"#8c7d75")
    for side in (-1,1):
        xa,xb=(x-5.85,x+5.85) if side==1 else (x+5.85,x-5.85)
        zz=z+side*.27
        face([(xa,5.72,zz),(xb,5.72,zz),(xb,9.24,zz),(xa,9.24,zz)],"#ffffff",label,normal=(0,0,side))

islands=[
    ("Alderney",[-432,-360,-288,-216],[-144,-72,0,72,144]),
    ("Algonquin",[-72,0,72,144],[-216,-144,-72,0,72,144,216]),
    ("Broker",[288,360,432],[-144,-72,0,72,144,216])]
nodeIds={}


def edge(x1,z1,x2,z2,bridge=False):
    meta["roads"].append([nodeIds[(x1,z1)],nodeIds[(x2,z2)],int(bridge)])


for district,xs,zs in islands:
    left,right,top,bottom=xs[0]-22,xs[-1]+22,zs[0]-22,zs[-1]+22
    meta["land"].append([left,top,right,bottom,district])
    for ix,x in enumerate(xs):
        for iz,z in enumerate(zs):
            nodeIds[(x,z)]=len(meta["nodes"])
            meta["nodes"].append([x,z])
            chunk(x,z)
            x0,x1=max(left,x-36),min(right,x+36)
            z0,z1=max(top,z-36),min(bottom,z+36)
            floor((x0+x1)/2,(z0+z1)/2,x1-x0,z1-z0,"#fff6ec","road",0,5)
            if ix==0 or ix==len(xs)-1:
                ex=left if ix==0 else right
                box(ex,-3,(z0+z1)/2,.75,3.4,z1-z0,"#8a8283")
                for s in range(math.ceil(z0/8)*8,math.ceil(z1/8)*8,8):
                    box(ex,.25,s,.38,1.0,.38,"#616a71")
                if z not in (-72,72): lamp(ex+(1 if ix==0 else -1)*1.8,z,1 if ix==0 else -1)
            if iz==0 or iz==len(zs)-1:
                ez=top if iz==0 else bottom
                box((x0+x1)/2,-3,ez,x1-x0,3.4,.75,"#8a8283")
            for direction in (-1,1):
                nx=ix+direction
                nz=iz+direction
                if 0<=nx<len(xs):
                    for offset in (15,25,35):
                        floor(x+direction*offset,z,4,.14,"#eac988",y=.055)
                    for k in range(-5,6,2):
                        floor(x+direction*8.5,z+k,2.2,.75,"#c6b9b1",y=.065)
                if 0<=nz<len(zs):
                    for offset in (15,25,35):
                        floor(x,z+direction*offset,.14,4,"#eac988",y=.055)
                    for k in range(-5,6,2):
                        floor(x+k,z+direction*8.5,.75,2.2,"#c6b9b1",y=.065)
            if ix: edge(xs[ix-1],z,x,z)
            if iz: edge(x,zs[iz-1],x,z)
    for ix,(xa,xb) in enumerate(zip(xs,xs[1:])):
        for iz,(za,zb) in enumerate(zip(zs,zs[1:])):
            x,z=(xa+xb)/2,(za+zb)/2
            chunk(x,z)
            park=(district,ix,iz) in [("Algonquin",1,1),("Broker",0,3),("Alderney",1,2)]
            meta["blocks"].append([x-28,z-28,x+28,z+28,1 if park else 0])
            box(x,.02,z,57,.21,57,"#b6a59d")
            floor(x,z,56.8,56.8,"#fff1dc","pave",.248)
            lamp(x-28,z-18,-1)
            lamp(x+28,z+19,1)
            if park:
                floor(x,z,48,48,"#f2e4cb","grass",.28)
                floor(x,z,3,50,"#d5bda0",y=.31)
                floor(x,z,50,3,"#d5bda0",y=.31)
                for dx in (-17,-8,9,18):
                    for dz in (-16,15):
                        tree(x+dx,z+dz,RNG.uniform(.85,1.35))
                for dx in (-8,8):
                    box(x+dx,.55,z+3,3,.25,.8,"#9b715c")
                    box(x+dx,.75,z+3.36,3,.65,.18,"#9f7860")
                if district=="Algonquin":
                    box(x,.32,z,4,.8,4,"#aaa596")
                    tube((x,1,z),(x,8,z),1.1,.45,"#beb49e",4)
                continue
            for j,dx in enumerate((-13.3,13.3)):
                for k,dz in enumerate((-13.3,13.3)):
                    downtown=district=="Algonquin"
                    w=RNG.uniform(19,25)
                    d=RNG.uniform(19,25)
                    if downtown:
                        h=RNG.uniform(25,72) + (21 if iz in (2,3) else 0)
                        mat=RNG.choice(["azure","deco","cream","slate","brick"])
                        style="tower" if h>51 else "tank"
                    elif district=="Alderney":
                        h=RNG.uniform(8,23)
                        mat=RNG.choice(["factory","brick","slate"])
                        style=RNG.choice(["tank","low"])
                    else:
                        h=RNG.uniform(9,29)
                        mat=RNG.choice(["umber","brick","cream","factory"])
                        style=RNG.choice(["tank","low"])
                    if (district,ix,iz,j,k)==("Algonquin",1,2,1,1): h,mat,style=121,"deco","tower"
                    if (district,ix,iz,j,k)==("Broker",0,2,0,1): shop="radio"
                    elif (district,ix,iz,j,k)==("Algonquin",1,4,0,0): shop="disco"
                    else: shop=True
                    building(x+dx,z+dz,w,d,h,mat,style,shop)
            chunk(x,z)
            if iz%2==0:
                tree(x,z-27,.82)
                tree(x,z+27,.9)
            if district=="Alderney" and iz==0:
                tube((x,0,z),(x,35,z),1.7,1.15,"#ac7064")
                tube((x,31,z),(x,33,z),1.32,1.28,"#d8c1a1")
    for j in range(6):
        ix=j%(len(xs)-1)
        iz=(j*3+1)%(len(zs)-1)
        meta["traffic"].append([nodeIds[(xs[ix],zs[iz])],nodeIds[(xs[ix+1],zs[iz])],round(.17+j*.105,3),j%4])
    for j in range(9):
        x=xs[j%(len(xs)-1)]+9.6
        z=zs[(j*3+1)%(len(zs)-1)]+14
        meta["people"].append([x,z,x,z+40,(j*7)%13/13,j%5])
    for j in range(4):
        meta["parked"].append([xs[j%len(xs)]+5.7,zs[(j+1)%(len(zs)-1)]+22,0 if j%2==0 else math.pi,j%4])


def bridge(x1,x2,z,suspension):
    edge(x1,z,x2,z,True)
    mid=(x1+x2)/2
    span=x2-x1
    chunk(mid,z)
    box(mid,-1.3,z,span,1.25,15.4,"#56606d")
    floor(mid,z,span,15.4,"#e7dcce","road",.025)
    for x in range(x1+10,x2-7,9):
        floor(x,z,4,.16,"#edce8c",y=.065)
    for side in (-1,1):
        zz=z+side*7.9
        box(mid,.01,zz,span,.23,1.2,"#afa5a1")
        box(mid,1.04,zz+side*.45,span,.19,.2,"#647183")
        for x in range(x1+9,x2-7,6):
            box(x,.18,zz+side*.45,.15,1,.19,"#72808c")
        ends=[x1+27,x2-27]
        if suspension:
            top=29 if z==72 else 22
            for xx in ends:
                box(xx,-3,zz,2.4,top+3,2.4,"#849099")
                box(xx-0.02,top-.42,z,2.5,.95,17.4,"#9ca2a0")
                box(xx,12,z,1.85,.82,17,"#7f8b95")
                tube((xx,14,zz),(xx,top-1,z-side*7.9),.3,.3,"#8996a1",4)
            path=[(x1,2.1,zz),(ends[0],top,zz)]
            for step in range(1,14):
                t=step/14
                px=ends[0]+(ends[1]-ends[0])*t
                py=top-(top-7)*4*t*(1-t)
                path.append((px,py,zz))
                tube((px,1.2,zz),(px,py,zz),.10,.10,"#657681",4)
            path.extend([(ends[1],top,zz),(x2,2.1,zz)])
            for a,b in zip(path,path[1:]): tube(a,b,.21,.21,"#6d7985",5)
        else:
            for xx in range(x1+16,x2-16,12):
                tube((xx,.2,zz),(xx+6,6.8,zz),.38,.38,"#71908b",4)
                tube((xx+6,6.8,zz),(xx+12,.2,zz),.38,.38,"#71908b",4)
            box(mid,6.6,zz,span-24,.6,.52,"#80958e")
            for xx in range(x1+22,x2-18,24):
                box(xx,6.6,z,.41,.42,16.4,"#80958e")
    for xx in (x1+27,x2-27):
        box(xx,-5,z,3.5,4,17.5,"#797d83")


for zz in (-72,72):
    bridge(-216,-72,zz,False)
    bridge(144,288,zz,True)
landmarkBoard(300,100,"radio")
landmarkBoard(62,85,"record")
landmarkBoard(-301,-86,"freight")
landmarkBoard(59,156,"disco")
landmarkBoard(419,-90,"garage")
landmarkBoard(130,225,"terminal")
meta["parked"].insert(0,[278,74.9,-math.pi/2,0])
meta["records"]=[[297.3,55],[422.7,-55],[350.7,199],[-62.7,-129],[81.3,195],[134.7,-199],[-422.7,125],[-278.7,-129],[-350.7,18]]
# Waterfront set pieces are offline geometry, including the harbor cranes and ferry slips.
for cx,cz in [(-443,-111),(-443,-37),(-438,106)]:
    chunk(cx,cz)
    for side in (-1,1):
        box(cx+side*3,-.2,cz,1.05,20,1.25,"#a16d5b")
        tube((cx+side*3,3,cz),(cx-side*3,14,cz),.38,.38,"#af7865",4)
    tube((cx,16,cz),(cx-21,29,cz),.73,.48,"#b68166",4)
    tube((cx,22,cz),(cx-21,29,cz),.41,.28,"#c49373",4)
    tube((cx,20,cz),(cx-9,23.1,cz),.25,.25,"#b78669",4)
    tube((cx-20,28,cz),(cx-20,11,cz),.105,.105,"#535565",4)
    box(cx,18,cz,7,3,4,"#c49272")
    for k in range(3):
        box(cx+4,0,cz+8+k*4,6,2.6,2.6,["#975e56","#72878b","#aa805c"][k])
# A ferry terminal on the southern tip of Algonquin.
chunk(120,229)
box(120,.15,229,35,3.8,9,"#eee4ce","cream")
box(120,3.95,229,37,.57,11,"#67827c")
for dx in (-12,-4,4,12):
    box(120+dx,-1.8,241,1,2.2,16,"#8e7568")
    box(120+dx,.15,247,.62,2.1,.62,"#857366")
obstacle(120,229,35,9,4.6)
# The radio mast is visible from both approaches to the Broker waterfront.
chunk(307,102)
for dx,dz in [(-2,-2),(2,-2),(0,2)]:
    tube((307+dx,24,102+dz),(307,49,102),.21,.1,"#af7b70",5)
for y in range(27,47,4):
    radius=(49-y)/12
    tube((307-radius,y,102-radius),(307+radius,y+3,102-radius),.13,.13,"#917977",4)
tube((307,48.6,102),(307,49.8,102),.38,.19,"#ff6358",7)
# A copper harbor monument on an offshore stone plinth.
chunk(209,179)
box(209,-2,179,16,2.3,14,"#95938c")
box(209,.3,179,8,3.7,7,"#b5a594")
box(209,4,179,6,1.5,5,"#c3b29c")
tube((209,5.5,179),(209,11.5,179),2.5,1.05,"#6f9288",7)
tube((209,11.5,179),(209,14.5,179),1.12,1.53,"#769c8e",6)
tube((209,14.6,179),(209,16.4,179),.72,.73,"#82a395",7)
tube((207.9,14,179),(206.6,18.6,179),.54,.29,"#759b8b",6)
tube((206.6,18.5,179),(206.6,20,179),.44,.2,"#ffd09a",6)
for zz in (-72,72):
    for xx in (171,261):
        for side in (-1,1):
            for y in (13.2,29.3 if zz==72 else 22.3):
                chunk(xx,zz)
                box(xx,y,zz+side*7.9,.65,.22,.62,"#ffd09a")
# A distant skyline surrounds the playable islands.
for x,z in [(RNG.uniform(-750,750),RNG.choice([-1,1])*RNG.uniform(445,610)) for _ in range(125)]:
    chunk(x,z)
    w,d,h=RNG.uniform(12,41),RNG.uniform(12,36),RNG.uniform(16,108)
    box(x,-5,z,w,h,d,"#b5a1a7",RNG.choice(["deco","azure","slate"]),"#a398a2",repeat=9)
    if h>72: box(x,h-5,z,w*.6,h*.19,d*.62,"#baaaa9","deco")
for x,z in [(RNG.choice([-1,1])*RNG.uniform(630,750),RNG.uniform(-445,445)) for _ in range(55)]:
    chunk(x,z)
    box(x,-5,z,24,RNG.uniform(18,72),26,"#b19ca3","slate")

# Low-poly vehicle shells, glass, chrome, lights and wheels are part of each baked model.
def hull(stations,color,paint=False):
    rings=[]
    for z,bottom,top,width in stations:
        rings.append([(-width*.84,bottom,z),(-width,bottom+.12,z),(-width,top-.11,z),(-width*.84,top,z),(width*.84,top,z),(width,top-.11,z),(width,bottom+.12,z),(width*.84,bottom,z)])
    for a,b in zip(rings,rings[1:]):
        for i in range(8):
            j=(i+1)%8
            face([a[i],b[i],b[j],a[j]],color,paint=paint)
    for ring in (rings[0],rings[-1]):
        for i in range(1,7):
            face([ring[0],ring[i],ring[i+1]],color,paint=paint)


def vehicle(kind):
    global mesh
    mesh=bytearray()
    models[kind]=mesh
    wagon=kind in ("taxi","patrol","sedan")
    van=kind=="van"
    width=1.02 if van else .98
    length=2.34 if wagon or van else 2.22
    floor(0,0,width*2.12,length*2.07,"#504853",y=.035)
    hull([(-length,.35,.85,width*.90),(-length+.32,.30,1.00,width),(.96,.29,.94,width*.99),(length,.39,.80,width*.9)],"#ffffff",True)
    if van:
        hull([(-2,.84,2.06,.94),(.62,.84,2.09,.94),(1.62,.84,1.52,.9)],"#ffffff",True)
        face([(-.78,1.53,1.63),(.78,1.53,1.63),(.79,1.99,.67),(-.79,1.99,.67)],"#486675")
        for side in (-1,1):
            face([(side*.948,1.35,-1.82),(side*.948,1.35,.55),(side*.948,1.91,.55),(side*.948,1.91,-1.82)],"#435360")
    else:
        rear=-1.52 if wagon else -1.63
        front=1.21 if wagon else 1.02
        top=1.57 if wagon else 1.39
        a=[(-.85,.94,rear),(.85,.94,rear),(.86,.94,front),(-.86,.94,front)]
        b=[(-.69,top,-.86),(.69,top,-.86),(.69,top,.36),(-.69,top,.36)]
        for i,c in enumerate(["#445761","#385158","#7e9b9d","#506773"]):
            j=(i+1)%4
            face([a[i],a[j],b[j],b[i]],c)
        face(b,"#faf1e4",paint=True,normal=(0,1,0))
        for aa,bb in zip(a,b): tube(aa,bb,.05,.045,"#b7a69b",4)
        for s in (-1,1):
            tube((s*.86,.95,-.28),(s*.69,top,-.28),.052,.053,"#4d474d",4)
            box(s*.98,.71,-.33,.06,.07,.29,"#d7c3ad")
    for sx in (-1,1):
        for zz in (-length*.61,length*.61):
            # Wheels are laid across the axle, with a visible hub on the outside face.
            tube((sx*.76,.43,zz),(sx*1.015,.43,zz),.43,.43,"#292a33",14)
            tube((sx*1.016,.43,zz),(sx*1.045,.43,zz),.24,.24,"#b9b7b2",12)
            tube((sx*1.046,.43,zz),(sx*1.06,.43,zz),.115,.115,"#51515a",8)
        box(sx*.63,.61,length+.015,.47,.17,.05,"#fff0bc")
        box(sx*.62,.60,-length-.02,.5,.19,.05,"#ff6358")
        box(sx*1.01,1.02,.43,.20,.13,.19,"#c4b6af")
    box(0,.38,-length-.027,1.75,.10,.10,"#cbbeb4")
    box(0,.38,length+.025,1.70,.10,.10,"#cbbeb4")
    box(0,.60,-length-.05,.41,.20,.035,"#eebb71")
    box(0,.62,length+.042,.67,.16,.045,"#3f4148")
    if kind=="taxi":
        box(0,1.57,-.04,.7,.24,.38,"#ffe29b")
        for s in (-1,1):
            for j in range(7): box(s*.985,.73,-1.1+j*.31,.04,.10,.16,"#433b3c")
    if kind=="patrol":
        box(0,1.57,-.04,1,.10,.37,"#485163")
        box(-.3,1.68,-.04,.46,.17,.34,"#f26672")
        box(.3,1.68,-.04,.46,.17,.34,"#568ce9")
        for s in (-1,1): box(s*.984,.56,-.1,.04,.34,1.2,"#eddfd1")


for name in ("coupe","sedan","taxi","van","patrol"): vehicle(name)

mesh=bytearray()
models["person"]=mesh
floor(0,0,.71,.57,"#605760",y=.03)
for s in (-1,1):
    tube((s*.15,.13,0),(s*.13,.91,0),.11,.14,"#323848",6)
    box(s*.15,.04,.055,.22,.15,.37,"#39333c")
    tube((s*.32,.84,0),(s*.275,1.37,0),.08,.12,"#ece5d8",6,True)
    tube((s*.32,.72,.02),(s*.32,.85,0),.077,.081,"#bc8067",6)
tube((0,.80,0),(0,1.42,0),.245,.31,"#ffffff",8,True)
tube((0,1.38,0),(0,1.52,0),.105,.11,"#b07a62",7)
tube((0,1.49,.006),(0,1.79,.006),.15,.165,"#ca9477",8)
tube((0,1.71,-.017),(0,1.83,-.017),.172,.13,"#494147",8)
box(0,1.57,.157,.08,.08,.042,"#bf856e")
mesh=bytearray()
models["ferry"]=mesh
hull([(-9,.02,1.2,2.8),(-7,.02,1.6,3.4),(6,.02,1.6,3.4),(9,.3,1.77,.5)],"#465968")
box(0,1.63,-1,5.5,1.8,11.7,"#efe2c8","cream")
box(0,3.47,-1,6.1,.35,12.2,"#b57159")
box(0,3.85,1.55,3.6,1.5,3.5,"#c4c5bd","azure")
for sx in (-1,1):
    tube((sx*1.4,3.8,-4),(sx*1.4,5.5,-4),.52,.55,"#b88562")
mesh=bytearray()
models["record"]=mesh
tube((0,.36,0),(0,1.19,0),.59,.59,"#b77c4f",4)
tube((0,1.2,0),(0,1.24,0),.48,.48,"#252d38",14)
tube((0,1.25,0),(0,1.26,0),.14,.14,"#ffbd77",10)
mesh=bytearray()
models["marker"]=mesh
tube((0,2.05,0),(0,2.65,0),.03,.35,"#ffdd8e",4)
tube((0,2.65,0),(0,3.08,0),.35,.03,"#ffdd8e",4)
for i in range(32):
    a,b=i*math.tau/32,(i+.73)*math.tau/32
    face([(math.sin(a)*3.15,.12,math.cos(a)*3.15),(math.sin(b)*3.15,.12,math.cos(b)*3.15),(math.sin(b)*2.89,.12,math.cos(b)*2.89),(math.sin(a)*2.89,.12,math.cos(a)*2.89)],"#ffdd8e",normal=(0,1,0))
mesh=bytearray()
models["water"]=mesh
floor(0,0,2800,2800,"#ffffff","water",-1.8,16)

def dataImage(image):
    file=BytesIO()
    image.save(file,format="PNG",optimize=True)
    return "data:image/png;base64,"+base64.b64encode(file.getvalue()).decode()


atlas=bytearray()
for image,emission in zip(tiles,emissions):
    layer=image.convert("RGBA")
    layer.putalpha(emission)
    atlas.extend(layer.tobytes())
ranges={}
cells=[]
packed=bytearray()
for key,part in sorted(chunks.items()):
    cells.append([key[0]*72+36,key[1]*72+36,len(packed)//16,len(part)//16])
    packed.extend(part)
for key,part in models.items():
    ranges[key]=[len(packed)//16,len(part)//16]
    packed.extend(part)
payload={"tileSize":TILE,"layers":len(tiles),"atlas":base64.b64encode(gzip.compress(atlas,compresslevel=9,mtime=0)).decode(),"shadow":dataImage(shadow.filter(ImageFilter.GaussianBlur(1.4))),"chunks":cells,"models":ranges,**meta}
out=ROOT/"assets"
out.mkdir(exist_ok=True)
payload["geometry"]=base64.b64encode(gzip.compress(packed,compresslevel=9,mtime=0)).decode()
(out/"city.js").write_text("const CITY = "+json.dumps(payload,separators=(",",":"))+";\n")
