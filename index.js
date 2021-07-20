const getRawBody = require('raw-body')
const getFormBody = require('body/form')
const body = require('body')
const execSync = require('child_process').execSync
const oss = require('ali-oss')
const fs = require('fs')
const path = require('path')

exports.handler = async (req, resp, context) => {
  // 设置响应类型
  resp.setHeader('Content-type', 'application/json')

  const client = new oss({
    region: 'oss-cn-shenzhen', // 根据实际设置填写
    accessKeyId: '',
    accessKeySecret: '',
    bucket: 'serverless-cicd'
  })

  async function get(filename, localpath, cmd) {
    try {
      let res = await client.get(filename, localpath)
      if (res.res.status == 200) execSync(`${cmd} ${localpath}`)
    } catch (e) {
      console.error(e)
    }
  }

  get('id_rsa', '/tmp/id_rsa', 'chmod 0600')
  get('my_ssh_executable.sh', '/tmp/my_ssh_executable.sh', 'chmod +x')

  console.log('下载密钥和脚本完成')

  getRawBody(req, async function (err, body) {
    body = body.toString().replace('undefined', '",')
    body = JSON.parse(body)
    const ref = body.ref
    const ref_type = body.ref_type
    const repository_name = body.repository.name
    const clone_url = body.repository.clone_url

    if (ref_type != 'tag') {
      resp.send('No tag event')
      return 0
    }

    if (fs.existsSync(`/tmp/${repository_name}/`)) execSync(`rm -rf /tmp/${repository_name}`)
    gitclone = `GIT_SSH="/tmp/my_ssh_executable.sh" git clone -b ${ref} ${clone_url} /tmp/${repository_name}`
    try {
      execSync(gitclone)
      console.log('克隆完成')
    } catch (e) {
      console.error(e)
      resp.send('git clone fail')
    }
    // execSync(`cd /tmp/${repository_name} && sh build.sh`)

    function getFilesList(dir) {
      let res = []
      let files = fs.readdirSync(dir)
      files.forEach(filename => {
        if (filename[0] == '.') return
        let filepath = path.join(dir, filename)
        let info = fs.statSync(filepath)
        if (info.isFile()) res.push({ filename, filepath })
        else res = res.concat(getFilesList(filepath))
      })
      return res
    }

    const files = getFilesList(`/tmp/${repository_name}/`)
    Promise.all(files.map(file => {
      return new Promise(async (resolve) => {
        let res = await client.put(file.filepath.replace(`/tmp`, ``), file.filepath)
        resolve(`${file.filename} uploading: ${res.res.status == 200}`)
      })
    })).then(r => {
      console.log(r)
      resp.send(JSON.stringify({
        ref, ref_type, repository_name, clone_url
      }))
    })
  })
}