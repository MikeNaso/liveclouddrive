const getConfig = require("./config.js");
const fs=require('fs')
const ms=require('./graph-autentication')
// const { dir } = require("console");
const axios=require('axios')
// const FormData = require('form-data');
const { Interface } = require("readline");

var _retries=0
const URI='https://graph.microsoft.com/v1.0/me/drive/root/children'
//https://graph.microsoft.com/v1.0/me/drive/root/delta

//https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0&tabs=http

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

function findDir( path, _struct, showPartial=true )
{
    _notFound=false
    // console.log("FindDir ", path)
    _path=path.split('/')

    _dir=_struct
    
    for( var b in _path)
    {
        if( _path[b]!='' )
        {
            if(_path[b] in _dir.folders)
                _dir=_dir.folders[_path[b]]
        }
        else
        {
            // console.log("NOT FOUND!!!! "+_path[b])
            _notFound=true
            break;
        }
    }
  return _dir
}

async function msUploadFile(opts, cb)
{
    // Create Session
    console.log("msUploadFile")
    await msCreateSession(opts, function( expiration, nextExp, url){
        var readStream = fs.createReadStream(opts.tpmName) 
        var data=[];
        var pos=0;
        // var buffer=null
        readStream.on('data', function(chunk) {
            data.push( chunk);
        }).on('end', function() {
            console.log( "END READ Stream")
            var buf=Buffer.concat(data)
            var _to=0;
            if( buf.length>65536)
                _to=65536
            else
                _to=buf.length
            msUploadBySession( url, 0, _to, buf, function(r){
                if( r.status==200 || r.status==202)
                {
                    console.log('Upload File Done',r.status)
                    cb(r.status)
                }
                
            } )
            // console.log(data); 
        // here you see all data processed at end of file
            });

    })
    // Read file

}

async function msUploadBySession( uri, posFrom, posTo, fullbuf, callback)
{
    var size=fullbuf.length
    var chunk=fullbuf.slice(posFrom,posTo)
    console.log("************ Pos %s Len %s Size %s ",posFrom,posTo,size)
    // console.log( Buffer.from(content) )
    console.log( 'bytes ',(posFrom+'-'+(posFrom+chunk.length-1)+'/'+size) )
    
    console.log( 'Chunk size ',chunk.length)
    await axios.request({
        baseURL: uri,
        method: 'put',
        headers: {
            "Content-Length": chunk.length,
            "Content-Range": 'bytes '+posFrom+'-'+(posFrom+chunk.length-1)+'/'+size,
        },      
        data: chunk
    }).
    then( (res)=>{
        console.log("Sent ",posFrom)
        
        if( 'nextExpectedRanges' in res.data)
        {
            var nextChunk=res.data.nextExpectedRanges[0].split('-')
            nextChunk[0]=parseInt(nextChunk[0])
            nextChunk[1]=parseInt(nextChunk[1])
            msUploadBySession( uri, nextChunk[0], (nextChunk[1]+1),fullbuf, function(r){
                console.log('DONE 1 ',r.status)
                callback(r)
            } )
        }
        callback(res)
    })
    .catch( (err) =>{
        console.log( err.status)
        if( 'response' in err && 'data' in err.response)
        {
            console.log( err.response.data)
        }
        else console.log( err)
        callback("ERRO")
    })
}


async function msUploadBySessionOLD( uri, pos, len, size, content, callback)
{
    console.log("************ Pos %s Len %s Size %s Content %s",pos,len,size, content.length)
    console.log( content)
    await axios.request({
        baseURL: uri,
        method: 'put',
        headers: {
            "Content-Length": len,
            "Content-Range": 'bytes '+pos+'-'+(pos+len-1)+'/'+(pos+len),
        },      
        data: content
    }).
    then( (res)=>{
        console.log( res.status)
        console.log( res.size)
        callback(res.size)
    })
    .catch( (err) =>{
        console.log("--------------------------------------------------")
        console.log( err.response.status)
        console.log( err.data )
        callback("ERRO")
    })

}

async function msCreateSession(opts, callback)
{
    console.log("msCreateSession "+opts.path)

    await axios.request({
        url: `me/drive/items/root:/${ opts.path }:/createUploadSession`,
        baseURL: getConfig.apiUrl,
        method: 'post',
        headers: { 
            Authorization: "Bearer "+opts.tokens.access_token,
            "Content-Type": "application/json"
        },
        // data:{item:{
        //     "@microsoft.graph.conflictBehavior": "replace",
        //     "description": "Uploaded by .....",
        //     "fileSize": opts.size,
        //     "name": opts.path
        // }}
    })
    .then( (res) =>{
        callback(res.data.expirationDateTime,  res.data.nextExpectedRanges,res.data.uploadUrl )
    })
    .catch( (err)=>{
        console.log( err )
        console.log( err.response.status )
        console.log( err.response.data )
        console.log("---==---")
        // console.log( err )

    })
}

async function msUnlink( opts, callback)
{
    console.log("msUnlink")
    // console.log( mycontent )
    await axios.request({
        url: `me/drive/items/${ opts.itemId }`,
        baseURL: getConfig.apiUrl,
        method: 'DELETE',
        headers: { 
            Authorization: "Bearer "+opts.tokens.access_token,
            "Content-Type": "application/json"
        }
    })
    .then( (res) =>{
        callback( 204 )
    })
    .catch( (err)=>{
        callback( 400 )
    })
}

async function msDownloadPartial1( _uri, _range, callback)
{
        if( _range!='') 
            _body={headers: {Range: 'bytes='+_range},responseType: 'arraybuffer'}

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

async function msDownloadPartial( opts, callback)
{
    console.log("msDownloadPartial ");
    if( opts.range!='') 
        _body={headers: {Range: 'bytes='+opts.range},responseType: 'arraybuffer'}

    console.log( "Range ",opts.range)
    await axios.get(opts.uri, _body)
    .then( 
        (res) => { 
            // console.log( res.data)
            callback('200',res.data)
        }
    )
    .catch ( (err) =>{
        callback('400','Sd')
    })
}

async function msDownload( opts, callback)
{
    _paths=opts.path.split('/')
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
          _notFound=true
          break;
        }
      }
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
    else 
        console.log( _dir)
    
    // var tokens=ms.getStoredToken()
    _URI=getConfig.apiUrl+'me/drive/items/'+_itemId+'?select=id,@microsoft.graph.downloadUrl'
    await axios.get(_URI, {    
        responseType: "json",
        headers: {"Authorization": "Bearer "+opts.tokens.access_token}
    })
    .then( (res) =>{
        if( '@microsoft.graph.downloadUrl' in res.data)
            callback('200', res.data['@microsoft.graph.downloadUrl'])
        else
        {
            console.log('MSDownload concluded')
            callback("400","")
        }
    })
    .catch( (err)=>{
        if( err.response==401)
        {
            console.log("*********** RENEW TOKEN!!!!!") 
            // ms.refreshToken(function(a){
            //     console.log("Refreshed")
            // })
            // _retries++;
        }
        else
            console.log( err);
        
        callback(err.response,'')
        // console.log(err.code)
    })
    // return response
}

async function msDownload1( _path, callback)
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
          _notFound=true
          break;
        }
      }
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
    else 
        console.log( _dir)
    
    var tokens=ms.getStoredToken()
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
            console.log('MSDownload concluded')
            callback("400","")
        }
    })
    .catch( (err)=>{
        if( err.response==401)
        {
            console.log("*********** RENEW TOKEN!!!!!") 
            // ms.refreshToken(function(a){
            //     console.log("Refreshed")
            // })
            // _retries++;
        }
        else
            console.log( err);
        
        callback(err.response,'')
        // console.log(err.code)
    })
    // return response
}

// async function buildTreeDelta( _nextURI='', _extra='', callback )
async function buildTreeDelta( opts, callback )
{
    console.log( 'BuildTreeDelta')
    // console.log( opts)
    if( opts.nextURI=='')
    {
        opts.nextURI=getConfig.apiUrl+'me/drive/items/root/delta'
        if( opts.extra!='')
            opts.nextURI+='?token='+encodeURI(opts.extra)
    }

    await axios.get(opts.nextURI, 
    {    
        responseType: "json",
        headers: {"Authorization": "Bearer "+opts.tokens.access_token}
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
            
            _path=res.data.value[i]['parentReference']['path'].split(':')
            _path=_path[1].split('/')

            _dir=_structure
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
                _elementById[res.data.value[i]['id']]=_dir.files[res.data.value[i]['name']]
            
        }
        if( _nextLink!='')
        {
            opts.nextURI=_nextLink;
            opts.extra="";
            buildTreeDelta( opts, callback )
        }
        else{
            callback( 200)
        }
    }).catch( err=>{
        console.log( err.response.status )
        if( err.response.status==401)
            console.log("*********** RENEW TOKEN!!!!!") 
        else
            console.log( err.response.data)
        callback(err.response.status)
        // console.log(err.code)
    })
}


async function ODInterface(callf, opts, cb )
{
    console.log('INTERFACE')
    ms.getToken( async function(token){
        opts.tokens=token
        // console.log("DDDDDD")
        // console.log( opts)
        await callf(opts, cb)
        
    })
    // callf(opts, cb)
}

module.exports = {
    ODInterface, 
    buildTreeDelta,
    msDownload,
    msDownloadPartial,
    findDir,
    msCreateSession,
    msUploadBySession,
    msUnlink,
    msUploadFile,
    // getStream,
    _elementById,
    _structure,
    _lastChecked,
}