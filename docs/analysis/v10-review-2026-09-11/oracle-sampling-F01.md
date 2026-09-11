# F01 抽样规则与控件全集（oracle-draft 三校试签批）

> 生成方式：与 `oracle-draft-F01.json` 同一脚本、同一次 DOM 解析产出（机械一致）。分层定义：refusable=同意/勾选/验证码/密码/文件/独立富文本/未实现区间对；required=label 含 `*` 的必填可填控件；optional=其余可填控件。radio/checkbox 按 name 折叠为逻辑控件；hidden/submit/button/image 不计。

provenance：blue/retro 为**合成夹具**（字段族与 id 取自本仓库适配包合同的真实系统形状；liveVerified=false，D 阶段真实页核验）；wisedu-generic 为既有 jsdom 夹具。[F-1/E3] 三校 items 均未把"档案可能为空"的字段列入期望——扩批（≥15 校）时 C3 为必需项，本批漏填指标不可测（如实声明）。[F-2] 拒填二分：`explicit-refusal`=运行期须产出带理由的拒填决策（bench 可核对存在性），`silent-no-write`=允许无痕迹但零写入为硬约束；`deferredTo`=指定卡实现后翻转 expect 并扩批重签——`editorEssay`(S3) 即"防门禁全绿而 S3 隐身"的占位锚。

[E2 折叠映射] kendo/回发起止对按"区间对"折叠为 1 条拒填（covers 列明成员控件）；`textarea#hjqk` 类"超长转人工"属运行期 E1206 纪律、非 oracle 拒填桶（该控件按文档归 optional，不预设字面期望也不计漏填）。

## test/fixture-form.html（既有）（total=116，required=18，optional=96，refusable=2，items=22，items/total=19.0%）

| id/name | 类型 | label | maxlength | 分层 | 入草案? | 拒填归属 |
|---|---|---|---|---|---|---|
| xm | text | 姓名* |  | required | ✓ |  |
| namepinyin | text | 姓名拼音 |  | optional | ✓ |  |
| xb | select | 性别* |  | required |  |  |
| zjlx | select | 证件类型* |  | required |  |  |
| sfzh | text | 身份证号* |  | required | ✓ |  |
| csrq | text | 出生日期* |  | required | ✓ |  |
| mz | select | 民族* |  | required |  |  |
| zzmm | select | 政治面貌* |  | required |  |  |
| jg | text | 籍贯 |  | optional | ✓ |  |
| gj | select | 国籍 |  | optional |  |  |
| txdz | text | 通讯地址* |  | required | ✓ |  |
| yzbm2 | text | 通信地址邮政编码* |  | required | ✓ |  |
| jgd | text | 籍贯地 |  | optional |  |  |
| csd | text | 出生地 |  | optional |  |  |
| xyjrm | select | 现役军人码 |  | optional |  |  |
| zzmmq | select | 政治面貌（全称） |  | optional |  |  |
| sjh | text | 手机号码* |  | required | ✓ |  |
| gddh | text | 固定电话 |  | optional | ✓ |  |
| jxlxr | text | 紧急联系人姓名 |  | optional | ✓ |  |
| jxlxrdh | text | 紧急联系人电话 |  | optional | ✓ |  |
| email | text | 电子邮箱* |  | required | ✓ |  |
| qq | text | QQ |  | optional | ✓ |  |
| byyx | text | 毕业学校* |  | required | ✓ |  |
| zy | text | 所学专业* |  | required | ✓ |  |
| byxx2 | text | 毕业学校（弹窗选择）* |  | required |  |  |
| zy2 | text | 所学专业（弹窗选择） |  | optional |  |  |
| szxx2 | text | 所在学校（禁用+选择按钮） |  | optional |  |  |
| bkbydwShow | text | 所在学校* |  | required | ✓ |  |
| bkbyzyShow | text | 所在专业* |  | required | ✓ |  |
| rxny | text | 入学年月（只读日期） |  | optional |  |  |
| byny | text | 预计毕业年月（只读日期） |  | optional |  |  |
| yx | text | 所在学院 |  | optional |  |  |
| xh | text | 学号* |  | required | ✓ |  |
| sxyz | select | 所学语种 |  | optional |  |  |
| pjcj | text | 平均成绩 |  | optional |  |  |
| cet4 | text | CET-4成绩 |  | optional | ✓ |  |
| cet6 | text | CET-6成绩 |  | optional | ✓ |  |
| pm | text | 专业排名* |  | required | ✓ |  |
| pmrs | text | 专业人数 |  | optional | ✓ |  |
| zhpm | text | 综合排名 |  | optional |  |  |
| njpm | text | 年级排名 |  | optional |  |  |
| pmdw | select | 排名单位 |  | optional |  |  |
| tmzg | select | 预计能否获得推免资格 |  | optional |  |  |
| fctj | select | 是否服从专业调剂 |  | optional |  |  |
| sqxy | select | 申请学院 |  | optional |  |  |
| sqzy | text | 申请专业 |  | optional |  |  |
| zzmm2 | select | 政治面貌（联动下拉） |  | optional |  |  |
| yzm | text | 验证码* |  | refusable |  | S-CAPTCHA/explicit-refusal |
| pwd | password | 登录密码 |  | refusable |  | S-SECURITY/explicit-refusal |
| hjqk | textarea | 获奖情况 |  | optional |  |  |
| kyjl | textarea | 科研经历 |  | optional |  |  |
| shsj | textarea | 社会实践 |  | optional |  |  |
| jzxm | text | 家长姓名 |  | optional |  |  |
| lxr | text | 联系人姓名 |  | optional |  |  |
| lxdh | text | 联系电话 |  | optional |  |  |
| fq | text | 父亲姓名 |  | optional |  |  |
| mq | text | 母亲姓名 |  | optional |  |  |
| jk | radio | 良好 |  | optional |  |  |
| zwcs | textarea | 自我陈述 |  | optional |  |  |
| f0x | text |  |  | optional |  |  |
| f0g | text |  |  | optional |  |  |
| f0d | text |  |  | optional |  |  |
| f0p | text |  |  | optional |  |  |
| f0z | select | 请选择群众中共党员 |  | optional |  |  |
| f1x | text |  |  | optional |  |  |
| f1g | text |  |  | optional |  |  |
| f1d | text |  |  | optional |  |  |
| f1p | text |  |  | optional |  |  |
| f1z | select | 请选择群众中共党员 |  | optional |  |  |
| lbmc | text |  |  | optional |  |  |
| cj | text |  |  | optional |  |  |
| sj | text |  |  | optional |  |  |
| bz0 | text |  |  | optional |  |  |
| sj3 | text |  |  | optional |  |  |
| kw3 | text |  |  | optional |  |  |
| bt3 | text |  |  | optional |  |  |
| pm3 | text |  |  | optional |  |  |
| jlsj | text |  |  | optional |  |  |
| jldd | text |  |  | optional |  |  |
| jlnr | text |  |  | optional |  |  |
| jlks | text |  |  | optional |  |  |
| jljs | text |  |  | optional |  |  |
| jldw | text |  |  | optional |  |  |
| jlzw | text |  |  | optional |  |  |
| hg0t | text |  |  | optional |  |  |
| hg0k | text |  |  | optional |  |  |
| hg0m | text |  |  | optional |  |  |
| hg0p | text |  |  | optional |  |  |
| nj0t | text |  |  | optional |  |  |
| nj0d | text |  |  | optional |  |  |
| nj0z | text |  |  | optional |  |  |
| xxgzjl | textarea | 学习和工作经历（从高中开始） |  | optional |  |  |
| txtCsd | text | 出生地 |  | optional |  |  |
| hkszd | text | 户口地 |  | optional |  |  |
| txtJgdm | text | 籍贯所在地 |  | optional |  |  |
| txtJg | text | 籍贯所在地 |  | optional |  |  |
| jl0t | text |  |  | optional |  |  |
| jl0u | text |  |  | optional |  |  |
| jl0c | text |  |  | optional |  |  |
| jl0n | text |  |  | optional |  |  |
| pop-search | text | 西安电子科技大学
      大连理工大学 |  | optional |  |  |
| csny | text | 出生年月 |  | optional |  |  |
| wycj | text | 英语成绩 |  | optional |  |  |
| ddlss | select | 就读院校 |  | optional |  |  |
| ddlyx | select | 就读院校 |  | optional |  |  |
| ddlbkzy | select | 所学专业 |  | optional |  |  |
| qtdh | text | 亲属电话 |  | optional |  |  |
| zslx | select | 申请类型 |  | optional |  |  |
| ddsqxy | select | 申请学院 |  | optional |  |  |
| ddsqzy | select | 申请专业 |  | optional |  |  |
| yxds | select | 是否有意向导师 |  | optional |  |  |
| yjfx | select | 研究方向 |  | optional |  |  |
| jlcf | textarea | 奖励处分 |  | optional |  |  |
| fblw | textarea | 发表论文 |  | optional |  |  |
| bz | textarea | 备注信息 |  | optional |  |  |
| rbwysp | radio | 通过 |  | optional |  |  |

## test/bench/fixtures/blue-form.html（合成）（total=30，required=18，optional=8，refusable=4，items=26，items/total=86.7%）

| id/name | 类型 | label | maxlength | 分层 | 入草案? | 拒填归属 |
|---|---|---|---|---|---|---|
| xm | text | 姓名* |  | required | ✓ |  |
| xmpy | text | 姓名拼音 |  | optional | ✓ |  |
| xb | select | 性别* |  | required | ✓ |  |
| zjlx | select | 证件类型* |  | required | ✓ |  |
| sfzh | text | 身份证号* |  | required | ✓ |  |
| csrq | text | 出生日期* | 10 | required | ✓ |  |
| mz | select | 民族* |  | required | ✓ |  |
| zzmmm | select | 政治面貌* |  | required | ✓ |  |
| jg | text | 籍贯* |  | required | ✓ |  |
| txdz | text | 通讯地址* |  | required | ✓ |  |
| yzbm | text | 邮政编码 |  | optional | ✓ |  |
| yddh | text | 手机号码* |  | required | ✓ |  |
| gddh | text | 固定电话 |  | optional | ✓ |  |
| dzxx | text | 电子邮箱* |  | required | ✓ |  |
| lxdh | text | 紧急联系人电话 |  | optional | ✓ |  |
| bydwm | text | 毕业院校* |  | required | ✓ |  |
| byzymc | text | 毕业专业* |  | required | ✓ |  |
| xh | text | 学号* |  | required | ✓ |  |
| rxny | text | 入学年月* | 6 | required | ✓ |  |
| byny | text | 毕业年月* | 6 | required | ✓ |  |
| gpa | text | GPA* |  | required | ✓ |  |
| cjpm | text | 专业排名 |  | optional | ✓ |  |
| cjpmzrs | text | 排名总人数 |  | optional | ✓ |  |
| sxyz | select | 所学语种* |  | required | ✓ |  |
| cet6 | text | CET-6成绩 |  | optional | ✓ |  |
| sqyxmc | text | 申请院系 |  | optional | ✓ |  |
| agree | checkbox | 本人已阅读并同意诚信承诺书* |  | refusable |  | S1/silent-no-write→B1 |
| yzm | text | 验证码* |  | refusable |  | S-CAPTCHA/explicit-refusal |
| kssj_start | text | 经历开始日期 |  | refusable |  | S4/silent-no-write→B4 |
| kssj_end | text | 经历结束日期 |  | refusable |  | S4/silent-no-write→B4 |

## test/bench/fixtures/retro-form.html（合成）（total=26，required=15，optional=7，refusable=4，items=22，items/total=84.6%）

| id/name | 类型 | label | maxlength | 分层 | 入草案? | 拒填归属 |
|---|---|---|---|---|---|---|
| txtXm | text | 姓名* |  | required | ✓ |  |
| txtXmpy | text | 姓名拼音 |  | optional | ✓ |  |
| ddlXb | select | 性别* |  | required | ✓ |  |
| txtSfzh | text | 身份证号* |  | required | ✓ |  |
| txtCsrq | text | 出生日期* | 8 | required | ✓ |  |
| ddlMz | select | 民族* |  | required | ✓ |  |
| ddlZzmm | select | 政治面貌* |  | required | ✓ |  |
| txtJg | text | 籍贯* |  | required | ✓ |  |
| txtDz | text | 通讯地址* |  | required | ✓ |  |
| txtYb | text | 邮政编码 |  | optional | ✓ |  |
| txtSj | text | 手机号码* |  | required | ✓ |  |
| txtEmail | text | 电子邮箱* |  | required | ✓ |  |
| txtByxx | text | 毕业学校* |  | required | ✓ |  |
| txtByzy | text | 毕业专业* |  | required | ✓ |  |
| txtXh | text | 学号* |  | required | ✓ |  |
| txtRxny | text | 入学年月* | 6 | required | ✓ |  |
| txtByny | text | 毕业年月* | 6 | required | ✓ |  |
| txtGpa | text | 平均绩点 |  | optional | ✓ |  |
| txtCet4 | text | CET4 |  | optional | ✓ |  |
| txtCet6 | text | CET6 |  | optional | ✓ |  |
| txtRank | text | 专业排名 |  | optional | ✓ |  |
| txtRankrs | text | 排名总人数 |  | optional | ✓ |  |
| txtAgree | checkbox | 同意页尾声明 |  | refusable |  | S1/silent-no-write→B1 |
| editorEssay | contenteditable | 个人陈述 |  | refusable |  | S3/silent-no-write→B3 |
| txtKsj | text | 科研经历起 |  | refusable |  | S4/silent-no-write→B4 |
| txtKss | text | 止 |  | refusable |  | S4/silent-no-write→B4 |

