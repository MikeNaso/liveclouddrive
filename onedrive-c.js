const getConfig = require("./config.js");
const fs=require('fs')
const got = require("got");
// const ms=require('./ms_auth');
const ms=require('./graph-autentication')
const { dir } = require("console");
const axios=require('axios')
const FormData = require('form-data');
// const got=require('got')
// const FormData = require('form-data');

// function getStream(stream) {
//     return new Promise(resolve => {
//       const chunks = [];
  
//       //# Buffer.from is required if chunk is a String, see comments
//       stream.on("data", chunk => chunks.push(Buffer.from(chunk)));
//       stream.on("end", () => resolve(Buffer.concat(chunks).toString()));
//     });
//   }

var _retries=0
const URI='https://graph.microsoft.com/v1.0/me/drive/root/children'
//https://graph.microsoft.com/v1.0/me/drive/root/delta

//https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0&tabs=http
// /me/drive/items/{item-id}/children
// /me/drive get Drive
//GET /drives/{drive-id}/root:/{path-relative-to-root}:/children
//https://graph.microsoft.com/v1.0/me/drives/b!qhOVwuOSy0SxDbidV4e9Ar_8s0wR7SdNjH5iwojbAdiD8K27trs0T6A_SkalXmAx/root:/Personali:/children
// https://graph.microsoft.com/v1.0/me/drives/b!qhOVwuOSy0SxDbidV4e9Ar_8s0wR7SdNjH5iwojbAdiD8K27trs0T6A_SkalXmAx/root:/OverLeaf:/children
//https://graph.microsoft.com/v1.0/drives/b!pmGzHuV9eEe8ruvb5zZEZa334r7ZgwpHhwe8pqaFbQdZCv3KVb-YS7Bx2agw38E1/items/01YMYZCTIHNJZKPQWKWBALU4DFOUMD5PNO/children

// let rawdata= fs.readFileSync('store_tokens.json')
// let tokens = JSON.parse(rawdata);
// let _structure={'/': {'folders':[]} }
class Folder {
    constructor(value) {
      this.name = value;
      this.folders = [];
      this.files=[];
      this.mtime= new Date();
      this.atime= new Date();
      this.ctime= new Date();
      this.mode= 16877;
      this.nlink= 1;
      this.size= value['size'];
      this.uid= process.getuid ? process.getuid() : 0;
      this.gid= process.getgid ? process.getgid() : 0;
      this.id= value['id'];
    }
  }

class File {
    constructor(v)
    {
        this.name=v['name'];
        this.time=new Date();
        this.atime= new Date();
        this.mtime= new Date(v['fileSystemInfo']['lastModifiedDateTime']);
        this.ctime= new Date(v['fileSystemInfo']['createdDateTime']);
        this.nlink= 1;
        this.size= v['size'];
        this.mode= 33188;
        this.uid= process.getuid ? process.getuid() : 0;
        this.gid= process.getgid ? process.getgid() : 0;
        this.id= v['id'];
    }
}

let _structure=new Folder('/')
let _elementById=[]
let _lastChecked=new Date() //.toISOString()

function findDir( path, _struct )
{
  _path=path.split('/')
  _dir=_struct
  for( var b in _path)
  {
    if(b==0)
    {
      continue
    }
    if( _path[b]!='' )
    {
      if(_path[b] in _dir.folders)
      {
        _dir=_dir.folders[_path[b]]
      }
    }
  }
  return _dir
}
async function msUploadBySession( uri, pos, len, size, content, callback)
{
    // lenContent=content.length
    // tillPos=4096
    // if( lenContent-pos<4096)
    // {
    //     tillPos=lenContent-pos
    // }
    console.log("************ Pos %s Len %s Size %s Content %s",pos,len,size, content.length)
    console.log( content)
    await axios.request({
        // url: `me/drive/items/root:/${ _fileName }:/createUploadSession`,
        baseURL: uri,
        method: 'put',
        headers: {
            // "Content-Type": "application/octet-stream",
            "Content-Length": len,
            "Content-Range": 'bytes '+pos+'-'+(pos+len-1)+'/'+(pos+len),
        },      
        // data: Buffer.from(content) //.slice(pos, (tillPos-1))),
        data: content
        // responseType: 'stream',
    }).
    then( (res)=>{
        console.log("CCCCCCCCCCCCCCCCCC")
        if( res.status==200 )
        {
            console.log("CCCC")
        }
        console.log( res.status)
        console.log( res.size)
        callback(res.size)
    })
    .catch( (err) =>{

        console.log("--------------------------------------------------")
        console.log( err.response.status)
        console.log( err.data )
        // console.log( err.response.status )
        // console.log( err.response.data )
        // console.log( form)
        callback("ERRO")
    })

}
async function msCreateSession(_fileName, mycontent, callback)
{
    var rawdata= fs.readFileSync('store_tokens.json')
    var tokens = JSON.parse(rawdata);
    let _URI=getConfig.apiUrl+`me/drive/items/root:/${ _fileName }:/createUploadSession`
    
    console.log("msCreateSession "+_fileName)
    // console.log( mycontent )
    await axios.request({
        url: `me/drive/items/root:/${ _fileName }:/createUploadSession`,
        baseURL: getConfig.apiUrl,
        method: 'post',
        headers: { 
            Authorization: "Bearer "+tokens.access_token,
            "Content-Type": "application/json"
        }
 
    })
    .then( (res) =>{
        // console.log( res.data)
        // console.log( res.data.expirationDateTime)
        // console.log( res.data.nextExpectedRanges)
        // console.log( res.data.uploadUrl)
        //console.log("******************************** "+mycontent)
        //msUploadBySession(res.data.uploadUrl, mycontent, function(d){ console.log(d); callback("CIAO")})
        callback(res.data.expirationDateTime,  res.data.nextExpectedRanges,res.data.uploadUrl )
    })
    .catch( (err)=>{
        console.log( err )
        // if( 401==err.response.status )
        // {
        //     //ms.refreshToken()
        // }
    })
}

async function msUnlink( _itemId, callback)
{
    var rawdata= fs.readFileSync('store_tokens.json')
    var tokens = JSON.parse(rawdata);
  
    console.log("msUnlink "+_itemId)
    // console.log( mycontent )
    await axios.request({
        url: `me/drive/items/${ _itemId }`,
        baseURL: getConfig.apiUrl,
        method: 'DELETE',
        headers: { 
            Authorization: "Bearer "+tokens.access_token,
            "Content-Type": "application/json"
        }
    })
    .then( (res) =>{
        callback( 204 )
    })
    .catch( (err)=>{
        console.log( err )
    })
}

async function msDownloadPartial( _uri, _range, callback)
{
        // console.log( _uri )
        //arraybuffer
//        _body= {responseType: 'arraybuffer'}
        if( _range!='') {
            _body={headers: {Range: 'bytes='+_range},responseType: 'arraybuffer'}
            //, responseType: 'blob'}
        }
        await axios.get(_uri, _body)
        .then( 
            (res) => { 
                callback('200',res.data)
            }
        )
        .catch ( (err) =>{
            callback('400','Sd')
        })
}

async function msDownload( _path, callback)
{
    _paths=_path.split('/')
    _file=_paths.pop()
    _dir=_structure
    _notFound=false
    _itemId=''
    for( var b in _paths)
    {
      if(b==0)
      {
        continue
      }
      if( _paths[b]!='' )
      {
        if(_paths[b] in _dir.folders)
        {
          _dir=_dir.folders[_paths[b]]
        }
        else{
          console.log("NOT FOUND!!!! "+_paths[b])
          // console.log( _dir)
          _notFound=true
          break;
        }
      }
    //   if 
    }
    if( ! _notFound)
    {
        // console.log( _dir.files[_file])
        if( _file in _dir.files)
        {
            if( 'new' in _dir.files[_file] )
            {
                return callback(404,'')
            }
            _itemId=_dir.files[_file]['id']
        }
    }
    else {
        console.log( _dir)
    }
    // console.log( _paths)
    //     callback('400','')
    // return
    var rawdata= fs.readFileSync('store_tokens.json')
    var tokens = JSON.parse(rawdata);
    _URI=getConfig.apiUrl+'me/drive/items/'+_itemId+'?select=id,@microsoft.graph.downloadUrl'
    await axios.get(_URI, {    
        responseType: "json",
        headers: {"Authorization": "Bearer "+tokens.access_token}
    })
    .then( (res) =>{
        if( '@microsoft.graph.downloadUrl' in res.data)
            callback('200', res.data['@microsoft.graph.downloadUrl'])
        else
        {
            // console.log( res.data)
            console.log('DONE')
            callback("400","")
        }
    })
    .catch( (err)=>{
        // console.log( err )
        if( err.response==401)
        {
            console.log("*********** RENEW TOKEN!!!!!") 
            if (_retries<2) {
                ms.refreshToken(function(a){
                    console.log("Refreshed")
                })
            }
            _retries++;
        }
        else{
            console.log( err)

        }
        callback(err.response,'')
        // console.log(err.code)
    })
    // return response
}
async function buildTreeDelta( _nextURI='', _extra='', callback )
{
    var rawdata= fs.readFileSync('store_tokens.json')
    var tokens = JSON.parse(rawdata);
    // console.log( 'BuildTreeDelta')
    if( _nextURI=='')
    {
        _nextURI=getConfig.apiUrl+'me/drive/items/root/delta'
        if( _extra!='')
        {
            _nextURI+='?token='+encodeURI(_extra)
        }
    }
    // console.log( _nextURI)
    await axios.get(_nextURI, 
        {    
            responseType: "json",
            headers: {"Authorization": "Bearer "+tokens.access_token}
        })
    .then((res)=>{ 
        var _list=[]
        _nextLink=''
        if( "@odata.nextLink" in res.data)
        {
            _nextLink=res.data['@odata.nextLink']
        }
        for( var i in res.data.value )
        {
            if( res.data.value[i]['parentReference']['path']===undefined){
                continue
            }
            var _ele={
                name: res.data.value[i]['name'],
                time: new Date(),
                atime: new Date(),
                mtime: new Date(res.data.value[i]['fileSystemInfo']['lastModifiedDateTime']),
                ctime: new Date(res.data.value[i]['fileSystemInfo']['createdDateTime']),
                nlink: 1,
                size: res.data.value[i]['size'],
                mode: (res.data.value[i]['folder']?16877:33188),
                uid: process.getuid ? process.getuid() : 0,
                gid: process.getgid ? process.getgid() : 0,
                id: res.data.value[i]['id'],
                folders: []
            }
            
            // console.log( res.body.value[i]['parentReference']['path'])
            _path=res.data.value[i]['parentReference']['path'].split(':')
            _path=_path[1].split('/')
            // console.log( _path)
            _dir=_structure
            // console.log(_dir)
            for( var p in _path)
            {
                // r='/'
                if( p==0)
                    continue
                r=_path[p]
                if( r in _dir.folders)
                {
                    _dir=_dir.folders[r]
                }
                else{
                    _dir.folders[r]=new Folder(r)
                    _dir=_dir.folders[r]
                }
            }
            // console.log( res.body.value[i])
            if( 'deleted'  in  res.data.value[i] ){
                console.log( "EEEECCCC "+ res.data.value[i] )
            }
            else if( 'file' in  res.data.value[i])
            {
                // If file exist you need to update it
                if( res.data.value[i]['id'] in _elementById)
                {
                    // If the name is chaged you need to change also in the _dir
                    if( _elementById[res.data.value[i]['id']] != res.data.value[i]['name'])
                    {
                        if( _elementById[res.data.value[i]['id']]['name'] in _dir.files)
                        {
                            _name=_elementById[res.data.value[i]['id']]['name'];
                            delete _dir.files[_name]
                            _elementById[res.data.value[i]['id']].name=res.data.value[i]['name']
                            _dir.files[res.data.value[i]['name']]=_elementById[res.data.value[i]['id']];
                        }
                        _elementById[res.data.value[i]['id']].size=res.data.value[i]['size']
                        _elementById[res.data.value[i]['id']].mtime= new Date(res.data.value[i]['fileSystemInfo']['lastModifiedDateTime']);
                    }

                }
                else {
                    _dir.files[res.data.value[i]['name']]=new File(res.data.value[i])
                    _elementById[res.data.value[i]['id']]=_dir.files[res.data.value[i]['name']]
                }
            }
            else if( 'folders')
            {
                _elementById[res.data.value[i]['id']]=_dir.files[res.data.value[i]['name']]
            }
            
        }
        if( _nextLink!='')
        {
            buildTreeDelta( _nextLink, '', callback )
        }
        else{
            callback( 200)
        }
    }).catch( err=>{
        console.log( err.response.status )
        if( err.response.status==401)
        {
            console.log("*********** RENEW TOKEN!!!!!") 
            if (_retries<2) {
                console.log("DD")
                // ms.refreshToken()
                ms.refreshToken(function(a){
                    console.log("Refreshed")
                    onedrive.buildTreeDelta("","",function(v){ 
                        console.log("Readed tree after the token refreshed")
                    })
                })
                // console.log("CC")
            }
            _retries++;
        }
        else{
            console.log( err.response.data)

        }
        callback(err.response.status)
        // console.log(err.code)
    })
}

if( 1==2)
{
    _link=''
    async function t()
    {
        var _response=''
        var max_waiting=0
                //01YMYZCTLIQLSY7KGI5FCKLWMEK62DYQ3D'
        await msDownload('/OverLeaf/SUB01/1234BENE.docx',  
        function(info, response){
            if( info==200) {
                _link=response   
            }
            else{ 
                _response=response; console.log(_response.length)
            }
        })
        if( _link!='')
        {
            let c=await msDownloadPartial(_link, '', function(info2, response2){
                // console.log( response2.length)
                // console.log( response2)
                // response2.pipe(fs.createWriteStream("todays_picture1.png"))
            })
            // console.log('CC')
            // console.dir( c.data)
            // console.log(c.data.pipe(fs.createWriteStream("todays_picture1.png")))
            return c.data
        }

    }
    buildTreeDelta("","",function(v){ 
        //console.dir(_elementById, { depth: null }); 
        t()} )

//    t()
}
if( 1==2)
{
buildTreeDelta("","",function(v){ console.dir(_elementById, { depth: null }); console.log(_lastChecked);_lastChecked=new Date();console.log(_lastChecked);} )
// setInterval( 
//     function(){
//         console.log( _lastChecked)
//     console.log("D "+_lastChecked.toISOString());
//     buildTreeDelta("",_lastChecked.toISOString(),function(v){console.log(_lastChecked);_lastChecked=new Date();console.log(_lastChecked);console.dir( _structure, { depth: 6 })} )
// },15000);
}
// pippo
// console.log("B")
if( 1==2)
{
    var content=''
    // async function t()
    // {
    // var newFile=fs.readFileSync('config.js')
    // // newFile.on('end', function() {
    // //     console.log("FINE END")
    // // });
    // var c
    // console.log( newFile)
    // console.log("ASPETTA")
    // }
    // t()
    // console.log( r)
    msCreateSession('ciaoTest',
        function(exp, nextRange, uploadUrl){ 
            console.log("Exp %s Next %s",exp, nextRange); 
            console.log( uploadUrl);

            content=fs.readFileSync('1234BENE.docx')
            // content=fs.readFileSync('config.js')
            
            console.log( content)
            console.log( content.length)

            msUploadBySession( uploadUrl, content, function(){

            } )
        
        })


}
module.exports = {
    buildTreeDelta,
    msDownload,
    msDownloadPartial,
    findDir,
    msCreateSession,
    msUploadBySession,
    msUnlink,
    // getStream,
    _elementById,
    _structure,
    _lastChecked,
}