const onedrive=require("../onedrive-c")
var tape = require('tape');

function readTree(t)
{
  onedrive.ODInterface(
      onedrive.buildTreeDelta, {nextURI: "", extra: ""}, (res)=>{
        console.log('CB ',res)
        // console.log( t )
        if( res==200)
        {
          t.ok(1)
          uploadFile(t)
        }
      }
    )
    
}

function uploadFile(t)
{
  // console.log( onedrive._structure)
  onedrive.ODInterface(
    onedrive.msUploadFile, {tpmName: "tests/test_file.upload", path:'this_is_from_test.txt'}, (res)=>{
      t.ok(1,'Upload file done')
      console.log( "File Uploaded")
      refreshTree(t)
    })
}

function refreshTree(t)
{
  onedrive.ODInterface(onedrive.buildTreeDelta,
    {nextURI: "", extra: onedrive._lastChecked.toISOString()}, (err)=>{ 
      onedrive._lastChecked=new Date(); 
      t.ok(3,"Riuscito refresh tree")
      _dir=onedrive.findDir('/this_is_from_test.txt', onedrive._structure, true);
      if( 'this_is_from_test.txt' in _dir.files )
      {
        // console.log(_dir.files['this_is_from_test.txt'])
        t.ok(4,'The file is in onedrive')
      }
      else
      {
        t.fail(4,"Didn't find the file uploaded")
      }
      // console.log(_dir)
    } 
  )
}
tape('teardown', function(t) {
  t.plan(4)
  readTree(t)
  // console.log("A")
});
// console.log("D")

