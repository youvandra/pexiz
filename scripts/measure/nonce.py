import json,urllib.request,base64,struct,sys
RPC="https://api.mainnet-beta.solana.com"
def rpc(m,p):
    r=urllib.request.Request(RPC,json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"Content-Type":"application/json"})
    j=json.load(urllib.request.urlopen(r,timeout=60)); return j.get("result",j.get("error"))
B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
def b58(b):
    n=int.from_bytes(b,'big');s=''
    while n: n,r=divmod(n,58); s=B58[r]+s
    return '1'*(len(b)-len(b.lstrip(b'\0')))+s
def members(addr):
    d=base64.b64decode(rpc("getAccountInfo",[addr,{"encoding":"base64"}])["value"]["data"][0])
    o=8+32+32+6+16; o+= 33 if d[o]==1 else 1; o+=1
    n=struct.unpack_from('<I',d,o)[0]; o+=4
    return [b58(d[o+i*33:o+i*33+32]) for i in range(n)]
for name,msig in [("JupiterPerps","AxkJ8oH5aDu4ZRWfsujPtxdb6Vhq4gDehpoReBgrUUSm"),("Drift","7qipzLR9j1JcvdxE1XJEFgvoyFmgBpgw5hMdHBMPcJtM"),("FlashTrade","Gb33UeQNnQ4XDuobtGq9M6PVKRVfoH77p8d6JXsgqyXF")]:
    for m in members(msig):
        r=rpc("getProgramAccounts",["11111111111111111111111111111111",{"encoding":"base64","dataSlice":{"offset":0,"length":0},"filters":[{"dataSize":80},{"memcmp":{"offset":8,"bytes":m}}]}])
        print(name,m,"nonce accounts:",len(r) if isinstance(r,list) else r)
