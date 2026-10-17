import struct
def _unpackbits_words(src):
    out=[];i=0
    while i<len(src):
        n=src[i];i+=1
        if n<128:
            for k in range(n+1): out.append(src[i:i+2]); i+=2
        elif n>128:
            for k in range(257-n): out.append(src[i:i+2])
            i+=2
    return b''.join(out)
def decode(b):
    """returns (w,h,rows of 16-bit ints) for 16-bit DirectBitsRect PICTs"""
    p=b.index(b'\x00\x9a')+2
    hdr=b[p:p+50]
    rb=struct.unpack_from('>H',hdr,4)[0]&0x3fff
    t,l,bm,r=struct.unpack_from('>4h',hdr,6)
    pack=struct.unpack_from('>H',hdr,16)[0]
    w,h=r-l,bm-t
    q=p+50+8+8+2  # src rect, dst rect, mode
    rows=[]
    for y in range(h):
        if rb<8:
            raw=b[q:q+rb]; q+=rb
        else:
            if rb>250: n=struct.unpack_from('>H',b,q)[0]; q+=2
            else: n=b[q]; q+=1
            raw=_unpackbits_words(b[q:q+n]) if pack==3 else b[q:q+rb]; q+=n
        rows.append(list(struct.unpack('>%dH'%w,raw[:2*w])))
    return w,h,pack,rows
def _packbits_words(words):
    out=bytearray(); i=0; n=len(words)
    while i<n:
        j=i
        while j+1<n and words[j+1]==words[i] and j-i<127: j+=1
        if j>i:
            out.append(257-(j-i+1)); out+=struct.pack('>H',words[i]); i=j+1
        else:
            s=i; lit=[]
            while i<n and len(lit)<128 and not (i+1<n and words[i+1]==words[i]):
                lit.append(words[i]); i+=1
            out.append(len(lit)-1); out+=struct.pack('>%dH'%len(lit),*lit)
    return bytes(out)
def encode(w,h,rows):
    """rows: h lists of w 16-bit RGB555 ints."""
    rb=w*2
    body=bytearray()
    body+=struct.pack('>hhhh',0,0,h,w)               # picFrame
    body+=b'\x00\x11\x02\xff'                         # version op
    body+=b'\x0c\x00'+struct.pack('>hhIIhhhhI',-2,0,0x00480000,0x00480000,0,0,h,w,0)  # header op
    body+=b'\x00\x1e'                                 # def hilite
    body+=b'\x00\x01\x00\x0a'+struct.pack('>4h',0,0,h,w)  # clip rgn
    body+=b'\x00\x9a'+struct.pack('>IH4hHHI',0xff,0x8000|rb,0,0,h,w,0,3,0)
    body+=struct.pack('>IIhhhhIII',0x00480000,0x00480000,16,16,3,5,0,0,0)
    body+=struct.pack('>4h',0,0,h,w)+struct.pack('>4h',0,0,h,w)+struct.pack('>h',0)
    for row in rows:
        pk=_packbits_words(row)
        body+=(struct.pack('>H',len(pk)) if rb>250 else bytes([len(pk)]))+pk
    if len(body)%2: body+=b'\0'
    body+=b'\x00\xff'
    return struct.pack('>H',(len(body)+2)&0xffff)+bytes(body)
