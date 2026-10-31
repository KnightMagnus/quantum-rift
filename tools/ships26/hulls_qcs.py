"""Quantum Concord security hulls and Concordance, rendered in model space."""
import math
import numpy as np
from hulls2 import DESIGNS, engine, GBLUE, GLASS, DARK, GUNM
from render2 import mat, loft, block, sphere
from hulls5 import rod
BLUE=mat((.12,.32,.65),metal=.65,panel=1.7,rough=.3,grime=.35)
ARMOR=mat((.24,.48,.78),metal=.6,panel=1.3,grime=.3)
SILVER=mat((.65,.8,.93),metal=.7,panel=.5,grime=.1)
MARK=mat((.5,.78,1),emissive=(.12,.3,.48),panel=0,grime=0)

def emblem(cx,cy,z,scale=.24):
    # Quantum Concord's crossed orbital ellipses and central diamond, in hull geometry.
    meshes=[]
    for angle in (math.pi/4,-math.pi/4):
        points=[]
        for t in np.linspace(0,math.tau,49):
            a,b=math.cos(t)*scale,math.sin(t)*scale*30/76
            points.append((cx+a*math.cos(angle)-b*math.sin(angle),cy+a*math.sin(angle)+b*math.cos(angle),z))
        meshes += [rod(a,b,.007,MARK,ring=6) for a,b in zip(points,points[1:])]
    pts=[(cx,cy+scale*52/76,z+.002),(cx+scale*30/76,cy,z+.002),(cx,cy-scale*52/76,z+.002),(cx-scale*30/76,cy,z+.002)]
    meshes += [rod(pts[i],pts[(i+1)%4],.009,MARK) for i in range(4)]
    return meshes

def make(option):
    M=[]; G=[]
    if option==1:
        sections=[(1.25,0,0,.04,.03,2),(1.12,0,0,.24,.13,2),(.8,0,0,.42,.2,2),(.25,0,0,.49,.25,2),(-.45,0,0,.44,.22,2),(-1,0,0,.31,.15,2),(-1.18,0,0,.17,.1,2)]
        M.append(loft(sections,BLUE,ring=32))
        # Irregular rounded armor blisters, rather than a wedge or flying saucer.
        for x,y,r in [(-.35,.55,.23),(.38,.2,.26),(-.37,-.28,.23),(.31,-.62,.22),(-.1,.87,.16)]:
            M.append(sphere((x,y,.12),r,ARMOR,squash=.5))
        M.append(loft([(.75,0,.19,.08,.04,2),(.4,0,.24,.15,.07,2),(-.3,0,.27,.19,.05,2),(-.65,0,.2,.09,.04,2)],SILVER,ring=24))
        badge=(0,.12,.335,.23); engines=[-.22,0,.22]; ey=-1.16
    elif option==2:
        M.append(loft([(1.25,0,0,.02,.025,3),(.82,0,0,.22,.11,4),(.15,0,0,.53,.19,5),(-.75,0,0,.68,.17,5),(-1.12,0,0,.55,.14,5)],BLUE,ring=24))
        for s in (-1,1):
            M.append(loft([(.45,s*.33,.13,.07,.05,5),(-.35,s*.44,.21,.14,.06,5),(-.95,s*.46,.17,.12,.05,5)],ARMOR,ring=16))
            for y in (-.6,-.25,.1):
                M.append(block((s*.43,y,.28),(.09,.12,.035),SILVER))
        M.append(block((0,-.5,.25),(.16,.22,.055),ARMOR))
        badge=(0,.08,.205,.25); engines=[-.4,-.2,0,.2,.4];ey=-1.13
    else:
        M.append(loft([(1.22,0,0,.03,.03,3),(.95,0,0,.2,.1,4),(.35,0,0,.26,.14,5),(-.95,0,0,.24,.15,5),(-1.2,0,0,.16,.1,3)],BLUE,ring=24))
        for s in (-1,1):
            M.append(block((s*.34,-.15,-.03),(.23,.45,.08),SILVER))
            M.append(loft([(.8,s*.63,0,.05,.04,3),(.5,s*.63,0,.13,.12,4),(-.85,s*.63,0,.15,.14,4),(-1.05,s*.63,0,.12,.1,3)],BLUE,ring=20))
            M.append(block((s*.29,.05,.065),(.055,.29,.012),DARK))
            for y in (-.65,-.3,.05,.4):
                M.append(block((s*.64,y,.14),(.08,.025,.018),ARMOR))
        M.append(block((0,-.4,.22),(.2,.3,.06),ARMOR))
        badge=(0,-.4,.285,.23);engines=[-.63,0,.63];ey=-1.16
    M+=emblem(*badge)
    # Dense broadside batteries and lit decks provide capital-ship scale cues.
    for s in (-1,1):
        for y in (-.7,-.42,-.14,.14,.42):
            x=s*(.36 if option==1 else .53 if option==2 else .63)
            M.append(sphere((x,y,.16),.052,GUNM,squash=.5))
            M.append(rod((x,y,.18),(x+s*.11,y+.04,.18),.012,GUNM))
        for y in np.linspace(-.75,.6,15):
            M.append(block((s*.17,float(y),.255 if option==1 else .16),(.014,.008,.008),MARK))
    M.append(block((0,-.68,.3),(.10,.10,.045),GLASS))
    for x in engines:
        e,g=engine(x,ey,0,.075,GBLUE,DARK);M+=e;G+=g
    return M,G,[],200

def hybrid():
    M,G,L,size=make(1)
    for s in (-1,1):
        start_m, start_g = len(M), len(G)
        braces = []
        # Curved carrier outriggers follow the organic flagship's rounded armor language.
        M.append(loft([(1.02,s*.76,-.035,.025,.025,2),(.8,s*.8,-.035,.13,.1,2),(.35,s*.85,-.035,.17,.14,2),(-.45,s*.85,-.035,.18,.15,2),(-1.08,s*.8,-.035,.13,.11,2),(-1.24,s*.76,-.035,.07,.07,2)],BLUE,ring=28))
        for y in (-.62,.22):
            brace = loft([(s*.3,y,-.055,.12,.055,2),(s*.7,y-.17,-.23,.15,.06,2),(s*.85,y-.22,-.285,.1,.04,2)],SILVER,ring=16,axis='x')
            M.append(brace); braces.append(brace)
        # Recessed bay wall, luminous threshold and overhanging rounded lip.
        M.append(block((s*.7,-.12,-.025),(.018,.33,.065),DARK))
        M.append(block((s*.677,-.12,-.075),(.008,.3,.008),MARK))
        for y in (-.62,-.05,.49):
            M.append(sphere((s*.85,y,.095),.115,ARMOR,squash=.45))
            M.append(sphere((s*.91,y,.15),.045,GUNM,squash=.6))
            M.append(rod((s*.91,y,.17),(s*1.04,y+.07,.17),.011,GUNM))
        e,g=engine(s*.76,-1.26,-.035,.078,GBLUE,DARK);M+=e;G+=g
        for mesh in M[start_m:] + G[start_g:]:
            if not any(mesh is brace for brace in braces):
                mesh.tf(lambda v: v + np.array([0,-.22,-.23]))
    return M,G,L,360
def body(M,width,length,z=0):
    M.append(loft([(length,0,z,.025,.025,2),(.8*length,0,z,width*.55,.10,2),(.25*length,0,z,width,.18,2),(-.55*length,0,z,width*.9,.15,2),(-length,0,z,width*.45,.09,2)],BLUE,ring=28))
def pod(M,G,x,front,rear,w,z):
    M.append(loft([(front,x,z,.018,.018,2),(front-.2,x,z,w*.8,w*.6,2),((front+rear)/2,x,z,w,w*.72,2),(rear,x,z,w*.65,w*.5,2)],BLUE,ring=24))
    e,g=engine(x,rear-.025,z,w*.6,GBLUE,DARK);M+=e;G+=g

def battery(M,x,y,z,r=.065):
    M.append(sphere((x,y,z),r,ARMOR,squash=.5))
    for dx in (-.018,.018): M.append(rod((x+dx,y,z+.03),(x+dx,y+.16,z+.03),.009,GUNM))

def fighter():
    M=[];G=[];body(M,.2,.85)
    M.append(loft([(.5,0,.14,.035,.025,2),(.12,0,.19,.1,.07,2),(-.25,0,.13,.08,.035,2)],GLASS,ring=20))
    for s in (-1,1):
        M.append(loft([(s*.12,-.12,-.03,.22,.035,2),(s*.5,-.36,-.14,.32,.035,2),(s*.65,-.58,-.17,.12,.018,2)],ARMOR,axis='x',ring=16))
        pod(M,G,s*.48,-.02,-.92,.095,-.14)
        M.append(rod((s*.6,-.5,-.12),(s*.6,.12,-.12),.018,GUNM))
    M+=emblem(0,-.43,.17,.12)
    return M,G,[],90

def drone():
    M=[];G=[];body(M,.28,.45)
    M.append(sphere((0,.2,.15),.105,GLASS,squash=.6))
    for s in (-1,1):
        M.append(loft([(s*.2,-.02,-.02,.1,.03,2),(s*.45,-.16,-.13,.14,.035,2)],SILVER,axis='x',ring=14))
        pod(M,G,s*.45,.18,-.55,.105,-.16)
        M.append(rod((s*.25,.15,.01),(s*.25,.5,.01),.022,GUNM))
    M+=emblem(0,-.17,.19,.14)
    return M,G,[],44

def battleship():
    M=[];G=[]
    # One contiguous armored spearhead, with no separate side hulls or struts.
    M.append(loft([(1.4,0,0,.06,.06,4),(1.05,0,0,.32,.16,4),(.3,0,0,.7,.23,4),(-.6,0,0,.66,.23,4),(-1.15,0,0,.47,.18,4)],BLUE,ring=24))
    M.append(loft([(.85,0,.19,.22,.055,4),(.25,0,.23,.48,.09,4),(-.75,0,.23,.4,.08,4)],ARMOR,ring=24))
    # Stepped dorsal spine and bridge, armored shoulders integrated into the hull.
    M.append(block((0,-.35,.35),(.22,.35,.065),SILVER))
    M.append(block((0,-.44,.43),(.17,.16,.04),GLASS))
    for s in (-1,1):
        for y in (-.55,-.08,.4): battery(M,s*.46,y,.31,.1)
        M.append(loft([(.8,s*.28,.17,.045,.025,4),(.2,s*.57,.21,.065,.025,4),(-.8,s*.53,.21,.06,.025,4)],SILVER,ring=12))
    for y,z in ((.93,.19),(.58,.28),(-.91,.25)):battery(M,0,y,z,.12)
    M+=emblem(0,.04,.335,.2)
    for x in (-.3,0,.3):
        e,g=engine(x,-1.18,0,.105,GBLUE,DARK);M+=e;G+=g
    return M,G,[],310

def carrier():
    M=[];G=[]
    # Broad continuous hangar hull and full-width flight deck, not twin pontoons.
    M.append(loft([(1.55,0,-.04,.39,.15,5),(1.25,0,-.04,.6,.21,5),(-1.18,0,-.04,.6,.21,5),(-1.5,0,-.04,.44,.16,5)],BLUE,ring=24))
    M.append(block((0,.02,.2),(.64,1.42,.045),ARMOR))
    M.append(block((-.12,.04,.25),(.36,1.29,.012),DARK))
    # Two runway guide lines on the same connected deck.
    for x in (-.45,.2):M.append(block((x,.04,.269),(.008,1.25,.008),MARK))
    for y in np.arange(-1.05,1.22,.22):M.append(block((-.125,y,.272),(.012,.055,.006),SILVER))
    for y in (-.85,.9):M.append(block((-.12,y,.275),(.25,.012,.007),SILVER))
    # Offset bridge island differentiates its silhouette from the battleship.
    M.append(block((.43,-.35,.33),(.13,.48,.1),BLUE))
    M.append(block((.43,-.48,.48),(.11,.2,.05),SILVER))
    M.append(block((.43,-.42,.535),(.105,.12,.015),GLASS))
    M.append(rod((.43,-.64,.5),(.43,-.64,.72),.014,GUNM))
    M.append(block((.43,-.64,.71),(.11,.025,.025),SILVER))
    M+=emblem(.43,.39,.265,.15)
    for x in (-.55,.55):
        for y in (-1.12,1.12):battery(M,x,y,.28,.055)
    # Bay shutters lie flush against the main hangar hull.
    for s in (-1,1):
        for y in (-.65,.05,.75):
            M.append(block((s*.602,y,-.025),(.009,.22,.085),DARK))
            M.append(block((s*.614,y,.063),(.008,.21,.008),MARK))
    for x in (-.3,0,.3):
        e,g=engine(x,-1.51,-.04,.095,GBLUE,DARK);M+=e;G+=g
    return M,G,[],380


DESIGNS.update(concordance_qcs=hybrid, qcs_battleship=battleship, qcs_carrier=carrier, qcs_fighter=fighter, qcs_drone=drone)
